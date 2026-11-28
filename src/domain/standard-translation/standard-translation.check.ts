/**
 * The standard translation check: for every standard translation the source
 * uses, whether the translation has it word for word (Used), has a variant of
 * it (Changed: written differently, or the entry was edited after the
 * translation used it), or lacks it (Missing). Pure, so the editor's
 * highlights, its hover card and the document panel's card share one reading
 * of the rules and never disagree.
 *
 * A translation is written line for line against its source (see the header of
 * src/components/editor/align-lines.ts), so each occurrence in the source is
 * looked for on the same lines of the translation, not anywhere in it: the
 * Glory Be on lines 7–8 is checked against lines 7–8.
 *
 * Linear in the texts but for one native substring search per entry and
 * window, as matching itself does: the editor runs it on every change of
 * documents up to 300,000 characters against dictionaries of 2,000 entries.
 */

import { diffWords, similarity, type DiffPart } from '@/domain/scripture/citations';
import type { Edit } from '@/domain/scripture/scripture-check';
import { frontmatterBlock } from '@/lib/frontmatter';
import { renderInLayout } from './layout';
import { findOccurrences, type OccurrenceKind } from './match';
import { sourceKeyOf, stripLayout, toMatchForm } from './match-form';
import type { StandardTranslationMatch } from './standard-translation.repository';
import { termFinder } from './stem';

export type StandardState = 'used' | 'changed' | 'missing';

export interface StandardCheckItem<E> {
  entry: E;
  kind: OccurrenceKind;
  state: StandardState;
  /** The occurrence in the source: raw offsets and 1-based first/last line numbers. */
  source: { from: number; to: number; firstLine: number; lastLine: number };
  /** Where the translation has it (Used, Changed); null when Missing. Raw offsets in the translation. */
  range: { from: number; to: number } | null;
  /** Changed only: a word diff from the translation's text to the standard one. */
  diff: DiffPart[] | null;
  /** Changed only: how many words differ (`changedWords`); 0 otherwise. */
  changedWords: number;
  /**
   * Changed verbatim only, when the occurrence is whole lines of the source:
   * the edit that writes the standard text over the translation's lines in
   * their layout (blockquotes, italics, pause markers), one undo step in the
   * editor. Null otherwise: inside a sentence there is no line layout to keep,
   * and which words of the line are the variant is a guess.
   */
  edit: Edit | null;
}

/**
 * Below this a translation's lines are some other text, not a variant of the
 * entry: Scripture's threshold for a reading being the passage it cites
 * (`MIN_SAME_PASSAGE` in src/domain/scripture/scripture-check.ts). Lower than
 * AI translation's near-miss threshold, because here the lines are already
 * known to be where the entry belongs: a translator who rewrote a few words, or
 * an entry rewritten since, still has to show as Changed.
 */
const MIN_SAME_TEXT = 0.6;

const WORD = /[\p{L}\p{M}\p{N}]/u;
/** The words `similarity` counts. */
const wordCount = (text: string) => text.match(/\p{L}+/gu)?.length ?? 0;

interface Span {
  from: number;
  to: number;
}

/** Lines `first` to `last` of the translation, read once however many occurrences share them. */
interface Window extends Span {
  key: string;
  text: string;
  form?: { key: string; map: number[] };
  plain?: { text: string; words: number };
  /** The lines read once for terms: every term entry looks in them. */
  terms?: ReturnType<typeof termFinder>;
}

/** What the check keeps per entry as it walks the source in order. */
interface EntryState {
  key: string;
  words: number;
  /**
   * Where the translation's last Used occurrence of the entry ended: the next
   * occurrence is looked for after it, so two in the source need two in the
   * translation. Occurrences come in source order, so windows only move down.
   */
  claimedTo: number;
  /** A search from this window and key index found nothing; it would find nothing again. */
  exhausted: string | null;
  /** The term's occurrences in each window, found once. */
  terms: Map<string, Span[]>;
}

/** The start offset of each line of `text`. */
function lineStarts(text: string): number[] {
  const starts = [0];
  for (let at = text.indexOf('\n'); at !== -1; at = text.indexOf('\n', at + 1)) starts.push(at + 1);
  return starts;
}

/** The 1-based line holding `offset`. */
function lineOf(starts: number[], offset: number): number {
  let low = 0;
  let high = starts.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (starts[mid] <= offset) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** The first of `length` sorted values, read by `at`, that is at least `target`; `length` when none is. */
function lowerBound(length: number, target: number, at: (i: number) => number): number {
  let low = 0;
  let high = length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (at(mid) < target) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** A match `[from, to)` in a match-form key with no word running on at either end: "amen" is not in "amens". */
function onWordBoundaries(key: string, from: number, to: number): boolean {
  const before = from > 1 && /[\uDC00-\uDFFF]/.test(key[from - 1]) ? key.slice(from - 2, from) : key[from - 1];
  const after = key.codePointAt(to);
  const wordBefore = before !== undefined && WORD.test(before);
  return !wordBefore && !(after !== undefined && WORD.test(String.fromCodePoint(after)));
}

/**
 * Every occurrence in the source of the `entries` (the general entries and
 * the document's project's, as AI translation gets them), each checked
 * against the same lines of the translation; sorted by source position, one
 * item per occurrence. The frontmatter of either text is never looked at.
 */
export function buildStandardCheck<E extends StandardTranslationMatch>({
  source,
  translation,
  entries,
}: {
  source: string;
  translation: string;
  entries: readonly E[];
}): StandardCheckItem<E>[] {
  const sourceOffset = frontmatterBlock(source).length;
  const occurrences = findOccurrences(source.slice(sourceOffset), entries);
  if (occurrences.length === 0) return [];

  const sourceLines = lineStarts(source);
  const translationLines = lineStarts(translation);
  const translationFrontmatter = frontmatterBlock(translation).length;
  // The first line after the closing `---`.
  const firstBodyLine = translationFrontmatter ? lineOf(translationLines, translationFrontmatter - 1) + 1 : 1;
  const lineEnd = (line: number) =>
    line < translationLines.length ? translationLines[line] - 1 : translation.length;

  const windows = new Map<string, Window>();
  const windowOf = (first: number, last: number): Window => {
    const key = `${first}-${last}`;
    let window = windows.get(key);
    if (!window) {
      const from = translationLines[first - 1];
      const to = lineEnd(last);
      window = { key, from, to, text: translation.slice(from, to) };
      windows.set(key, window);
    }
    return window;
  };

  const states = new Map<E, EntryState>();
  const stateOf = (entry: E): EntryState => {
    let state = states.get(entry);
    if (!state) {
      state = {
        key: sourceKeyOf(entry.targetText),
        words: wordCount(entry.targetText),
        claimedTo: 0,
        exhausted: null,
        terms: new Map(),
      };
      states.set(entry, state);
    }
    return state;
  };

  return occurrences.map(({ entry, kind, from, to, lines }) => {
    const firstLine = lineOf(sourceLines, sourceOffset + from);
    const lastLine = lineOf(sourceLines, sourceOffset + to - 1);
    const item: StandardCheckItem<E> = {
      entry,
      kind,
      state: 'missing',
      source: { from: sourceOffset + from, to: sourceOffset + to, firstLine, lastLine },
      range: null,
      diff: null,
      changedWords: 0,
      edit: null,
    };
    // A translation shorter than the source has fewer of the lines: what is left of them is checked.
    const first = Math.max(firstLine, firstBodyLine);
    const last = Math.min(lastLine, translationLines.length);
    if (first > last) return item;

    const window = windowOf(first, last);
    const state = stateOf(entry);
    const found = kind === 'term' ? findTerm(window, entry, state) : findVerbatim(window, state);
    if (found) {
      state.claimedTo = found.to;
      return { ...item, state: 'used', range: found };
    }
    if (kind === 'term') return item;
    return changed(item, window, state, lines !== null) ?? item;
  });
}

/** The entry's wording on the window's lines, in the simplified form, after the last one claimed. */
function findVerbatim(window: Window, state: EntryState): Span | null {
  if (!state.key) return null;
  window.form ??= toMatchForm(window.text);
  const { key, map } = window.form;
  const start = lowerBound(key.length, state.claimedTo - window.from, (i) => map[i]);
  const attempt = `${window.key}@${start}`;
  if (state.exhausted === attempt) return null;
  for (let at = key.indexOf(state.key, start); at !== -1; at = key.indexOf(state.key, at + 1)) {
    const end = at + state.key.length;
    if (onWordBoundaries(key, at, end)) return { from: window.from + map[at], to: window.from + map[end - 1] + 1 };
  }
  state.exhausted = attempt;
  return null;
}

/** The term in any grammatical form on the window's lines, after the last one claimed. */
function findTerm<E extends StandardTranslationMatch>(window: Window, entry: E, state: EntryState): Span | null {
  let spans = state.terms.get(window.key);
  if (!spans) {
    window.terms ??= termFinder(window.text);
    spans = window.terms(entry.targetText).map((span) => ({
      from: window.from + span.from,
      to: window.from + span.to,
    }));
    state.terms.set(window.key, spans);
  }
  const at = lowerBound(spans.length, state.claimedTo, (i) => spans[i].from);
  return spans[at] ?? null;
}

/**
 * The item as Changed when the window's wording is similar enough to the
 * entry's, else null. A Dice coefficient can't reach the threshold when the
 * word counts are too far apart, so a long line is ruled out by its count
 * before its words are compared.
 */
function changed<E extends StandardTranslationMatch>(
  item: StandardCheckItem<E>,
  window: Window,
  state: EntryState,
  wholeLines: boolean,
): StandardCheckItem<E> | null {
  window.plain ??= (() => {
    const { text } = stripLayout(window.text);
    return { text, words: wordCount(text) };
  })();
  const { text, words } = window.plain;
  const bound = (2 * Math.min(words, state.words)) / (words + state.words || 1);
  if (bound < MIN_SAME_TEXT || similarity(text, item.entry.targetText) < MIN_SAME_TEXT) return null;

  window.form ??= toMatchForm(window.text);
  const { key, map } = window.form;
  const edit: Edit | null = wholeLines
    ? {
        from: window.from,
        to: window.to,
        insert: renderInLayout(window.text, item.entry.targetText).text,
        expected: window.text,
      }
    : null;
  return {
    ...item,
    state: 'changed',
    range: { from: window.from + map[0], to: window.from + map[key.length - 1] + 1 },
    diff: diffWords(text, item.entry.targetText),
    changedWords: changedWords(text, item.entry.targetText),
    edit,
  };
}

/** How many words differ: a word replaced by another counts once. */
export function changedWords(current: string, official: string): number {
  let changed = 0;
  let deleted = 0;
  let inserted = 0;
  const flush = () => {
    changed += Math.max(deleted, inserted);
    deleted = 0;
    inserted = 0;
  };
  for (const part of diffWords(current, official)) {
    const count = part.text.split(' ').length;
    if (part.type === 'equal') flush();
    else if (part.type === 'delete') deleted += count;
    else inserted += count;
  }
  flush();
  return changed;
}
