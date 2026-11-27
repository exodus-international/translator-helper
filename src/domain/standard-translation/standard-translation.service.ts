import { similarity } from '@/domain/scripture/citations';
// Scripture's threshold: below it, a line is another text, not a variant of the entry.
import { MIN_SIMILARITY } from '@/domain/scripture/scripture.service';
import { frontmatterBlock } from '@/lib/frontmatter';
import { entryLabel } from './entry-label';
import { renderInLayout, type LayoutNotice } from './layout';
import { findOccurrences, type Occurrence } from './match';
import { sourceKeyOf, stripLayout } from './match-form';
import { buildStandardPrompt, type StandardPromptParts } from './prompt';
import { changedWords } from './standard-translation.check';
import type { StandardTranslationMatch } from './standard-translation.repository';
import { findTermOccurrences } from './stem';

/**
 * Standard translations are never translated by the AI. Before the source goes
 * to the model, each verbatim occurrence of an entry is swapped for a
 * placeholder (`{{std:1}}`); after the model answers, code fills it with the
 * entry's translation in the occurrence's layout, so the wording is exactly
 * the team's. A term (an occurrence inside a sentence, whose form the grammar
 * may change) stays in the source and goes into the prompt's glossary, and the
 * draft is checked for it by word stem.
 *
 * It runs on Scripture's output (`prepareScripture` in
 * src/domain/scripture/scripture.service.ts), so a standard translation can't
 * match across a `{{bible:n}}`: the Bible comes first. Markdown only; the
 * caller decides.
 */

// A near miss on a shorter entry would mostly be noise: "Hail Mary" is like many short lines.
const MIN_NEAR_MISS_WORDS = 4;
const MAX_NEAR_MISS_PAIRS = 200_000;

const PLACEHOLDER_PREFIX = '{{std:';
const PLACEHOLDERS = /\{\{std:\d+\}\}/g;
const LOOKBACK = 200;

const placeholder = (n: number) => `${PLACEHOLDER_PREFIX}${n}}}`;

export interface PreparedStandardTranslations {
  /** The source with verbatim standard translations replaced by placeholders. */
  content: string;
  /** The prompt's "Standard translations" section; empty when the document uses none. */
  prompt: string;
  /** Fills the placeholders in the model's translation and checks its terms. */
  restore(translation: string): { content: string; notices: string[] };
}

const unchanged = (content: string, notices: string[] = []): PreparedStandardTranslations => ({
  content,
  prompt: '',
  restore: (translation) => ({ content: translation, notices }),
});

const LAYOUT_WARNINGS: Record<LayoutNotice, (label: string) => string> = {
  'pause-moved': (label) => `A pause marker inside "${label}" was moved to its end; check where it belongs.`,
  'formatting-differs': (label) => `The formatting inside "${label}" differs from the standard; check it.`,
};

interface Fill {
  entry: StandardTranslationMatch;
  /** The raw lines the placeholder took the place of, or null when it replaced a span inside a line. */
  lines: string | null;
  /**
   * Comments (pause markers) inside a span that replaced part of a line. The
   * entry's text has nowhere to keep them, so they go after it, with a warning.
   */
  comments: string[];
}

/** The HTML comments in `text[from, to)`, in order. */
function commentsIn(text: string, from: number, to: number): string[] {
  const found: string[] = [];
  for (let open = text.indexOf('<!--', from); open !== -1 && open < to; ) {
    const close = text.indexOf('-->', open + 4);
    if (close === -1 || close + 3 > to) break;
    found.push(text.slice(open, close + 3));
    open = text.indexOf('<!--', close + 3);
  }
  return found;
}

/**
 * Swaps the verbatim standard translations in `prepared` (the source after
 * Scripture) for placeholders. `entries` are the general entries of the target
 * language and those of the document's project; `original` is the source
 * before Scripture, to tell when Scripture took an entry's place.
 */
export function prepareStandardTranslations(
  prepared: string,
  entries: StandardTranslationMatch[],
  options: { original: string },
): PreparedStandardTranslations {
  if (entries.length === 0 || prepared.includes(PLACEHOLDER_PREFIX)) return unchanged(prepared);

  const frontmatter = frontmatterBlock(prepared);
  const body = prepared.slice(frontmatter.length);
  const occurrences = findOccurrences(body, entries);
  const notices = missedEntries(body, entries, occurrences, options.original);

  const fills = new Map<string, Fill>();
  const hints: StandardPromptParts['hints'] = [];
  const terms = new Map<string, StandardTranslationMatch>();
  let content = '';
  let at = 0;
  for (const occurrence of occurrences) {
    const { entry, kind, lines } = occurrence;
    if (kind === 'term') {
      terms.set(entry.sourceKey, entry);
      continue;
    }
    const span = lines ?? occurrence;
    const key = placeholder(fills.size + 1);
    fills.set(key, {
      entry,
      lines: lines && body.slice(lines.from, lines.to),
      comments: lines ? [] : commentsIn(body, occurrence.from, occurrence.to),
    });
    if (!lines) hints.push({ placeholder: key, text: entry.targetText });
    content += body.slice(at, span.from) + key;
    at = span.to;
  }
  if (fills.size === 0 && terms.size === 0) return unchanged(prepared, notices);
  content = frontmatter + content + body.slice(at);

  const prompt = buildStandardPrompt({
    placeholders: fills.size > 0,
    hints,
    terms: [...terms.values()].map((entry) => ({ source: entry.sourceText, target: entry.targetText })),
  });

  return {
    content,
    prompt,
    restore(translation) {
      const restoreNotices = [...notices];
      // One pass over the draft, each placeholder filled where it stands:
      // searching the draft once per placeholder would be quadratic in a
      // long document full of them.
      const rendered = new Map<string, { text: string; notices: LayoutNotice[] }>();
      const filledKeys = new Set<string>();
      let invented = false;
      let filled = '';
      // Enough of what was written before a placeholder to tell whether it opens a sentence.
      let tail = '';
      let at = 0;
      const write = (text: string) => {
        filled += text;
        tail = (tail + text).slice(-LOOKBACK);
      };
      for (const match of translation.matchAll(PLACEHOLDERS)) {
        write(translation.slice(at, match.index));
        at = match.index + match[0].length;
        const fill = fills.get(match[0]);
        if (!fill) {
          invented = true;
          continue;
        }
        filledKeys.add(match[0]);
        if (fill.lines === null) {
          const text = opensSentence(tail) ? capitalised(fill.entry.targetText) : fill.entry.targetText;
          write(text + fill.comments.map((comment) => ` ${comment}`).join(''));
          continue;
        }
        let layout = rendered.get(match[0]);
        if (!layout) {
          layout = renderInLayout(fill.lines, fill.entry.targetText);
          rendered.set(match[0], layout);
        }
        write(layout.text);
      }
      write(translation.slice(at));

      for (const [key, { entry, lines, comments }] of fills) {
        const label = entryLabel(entry);
        if (!filledKeys.has(key)) {
          restoreNotices.push(`The AI dropped the standard translation of "${label}"; add it where it belongs.`);
        } else if (lines === null) {
          if (comments.length > 0) restoreNotices.push(LAYOUT_WARNINGS['pause-moved'](label));
        } else {
          restoreNotices.push(...rendered.get(key)!.notices.map((notice) => LAYOUT_WARNINGS[notice](label)));
        }
      }
      if (invented) {
        restoreNotices.push(
          'The AI added standard translation placeholders that were not in the source; they were removed.',
        );
      }
      // The model's own words, before any standard text went in: a term the
      // team's filled-in text happens to contain says nothing about the AI.
      const drafted = translation.replace(PLACEHOLDERS, '');
      for (const entry of terms.values()) {
        if (findTermOccurrences(drafted, entry.targetText).length === 0) {
          restoreNotices.push(`The AI may not have used the standard term "${entryLabel(entry)}".`);
        }
      }
      return { content: filled, notices: restoreNotices };
    },
  };
}

// ─── Inline placeholders ──────────────────────────────────

/** What may stand between a sentence's start and its first word: emphasis and opening quotation marks. */
const OPENING = new Set(['*', '_', '"', "'", '“', '„', '«', '»', '‘', '‚', '‹', '›']);
/** What may follow the punctuation that ends a sentence: closing quotation marks, brackets and emphasis. */
const CLOSING = new Set(['*', '_', '"', "'", '”', '“', '»', '«', '’', '‘', '›', '‹', ')', ']']);
const TERMINAL = new Set(['.', '!', '?', '…']);
/** A line's prefix: indentation, blockquote markers, then a list marker or heading. Unambiguous, so linear. */
const LINE_PREFIX = /^[ \t]*(?:>[ \t]*)*(?:(?:[-+*]|\d{1,9}[.)]|#{1,6})[ \t]+)?$/;

/** Whether the text after `before` starts a sentence: at a line's start after its prefix, or after `.` `!` `?` `…` and a space. */
function opensSentence(before: string): boolean {
  let i = before.length;
  while (i > 0 && OPENING.has(before[i - 1])) i--;
  const lineStart = before.lastIndexOf('\n', i - 1) + 1;
  if (LINE_PREFIX.test(before.slice(lineStart, i))) return true;
  const spaced = i;
  while (i > lineStart && (before[i - 1] === ' ' || before[i - 1] === '\t')) i--;
  if (i === spaced) return false;
  while (i > lineStart && CLOSING.has(before[i - 1])) i--;
  return i > lineStart && TERMINAL.has(before[i - 1]);
}

function capitalised(text: string): string {
  const first = text.search(/\p{L}/u);
  return first === -1 ? text : text.slice(0, first) + text[first].toLocaleUpperCase() + text.slice(first + 1);
}

// ─── Entries not found ────────────────────────────────────

/**
 * Warnings for the entries the source almost uses: one found only before
 * Scripture took its place, or one a line or paragraph is very like. One per
 * source, the project's entry over the general one, as matching ranks them.
 */
function missedEntries(
  body: string,
  entries: StandardTranslationMatch[],
  occurrences: Occurrence<StandardTranslationMatch>[],
  original: string,
): string[] {
  const used = new Set(occurrences.map((occurrence) => occurrence.entry.sourceKey));
  const missed = new Map<string, StandardTranslationMatch>();
  for (const entry of entries) {
    if (!entry.sourceKey || used.has(entry.sourceKey)) continue;
    const held = missed.get(entry.sourceKey);
    if (!held || (held.sourceProjectId === null && entry.sourceProjectId !== null)) missed.set(entry.sourceKey, entry);
  }
  if (missed.size === 0) return [];

  const notices: string[] = [];
  const originalBody = original.slice(frontmatterBlock(original).length);
  if (originalBody !== body) {
    // Matched with every entry, so a longer one still claims its text: an
    // entry missed because a longer one took it was not taken by Scripture.
    const inOriginal = new Set(findOccurrences(originalBody, entries).map((o) => o.entry.sourceKey));
    for (const key of [...missed.keys()].filter((key) => inOriginal.has(key))) {
      notices.push(
        `"${entryLabel(missed.get(key)!)}" contains a Scripture citation, so the Bible was used for it; the standard translation wasn't applied.`,
      );
      missed.delete(key);
    }
  }
  return [...notices, ...nearMisses(body, [...missed.values()], occurrences)];
}

const wordsOf = (text: string) => text.toLowerCase().match(/\p{L}+/gu) ?? [];

interface Candidate {
  key: string;
  words: number;
}

/**
 * The lines and paragraphs of the source, as candidates for a near miss.
 * Those holding a verbatim occurrence are left out: their wording is the
 * team's, whatever other entry they resemble.
 */
function candidatesIn(body: string, occurrences: Occurrence<StandardTranslationMatch>[]): Candidate[] {
  // In text order and never overlapping, so their ends are in order too: the
  // first that ends after `from` is the only one a span can start inside of.
  const verbatim = occurrences.filter((occurrence) => occurrence.kind === 'verbatim');
  const overlapsVerbatim = (from: number, to: number) => {
    let low = 0;
    let high = verbatim.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (verbatim[mid].to <= from) low = mid + 1;
      else high = mid;
    }
    return low < verbatim.length && verbatim[low].from < to;
  };
  const candidates: Candidate[] = [];
  const add = (from: number, to: number) => {
    if (overlapsVerbatim(from, to)) return;
    const { text } = stripLayout(body.slice(from, to));
    const words = wordsOf(text).length;
    if (words >= MIN_NEAR_MISS_WORDS) candidates.push({ key: sourceKeyOf(text), words });
  };

  let paragraphStart = -1;
  let lineCount = 0;
  let previousEnd = 0;
  for (let start = 0; start <= body.length; ) {
    const newline = body.indexOf('\n', start);
    const end = newline === -1 ? body.length : newline;
    const blank = stripLayout(body.slice(start, end)).text.trim() === '';
    if (!blank) {
      add(start, end);
      if (paragraphStart === -1) paragraphStart = start;
      lineCount++;
    }
    if (blank || newline === -1) {
      if (lineCount > 1) add(paragraphStart, blank ? previousEnd : end);
      paragraphStart = -1;
      lineCount = 0;
    }
    previousEnd = end;
    if (newline === -1) break;
    start = newline + 1;
  }
  return candidates;
}

/**
 * `"<name>" looks like a standard translation but differs (n words)` for each
 * entry of four words or more that a line or paragraph is at least as similar
 * to as Scripture asks of a reading, the most similar one counted.
 */
function nearMisses(
  body: string,
  missed: StandardTranslationMatch[],
  occurrences: Occurrence<StandardTranslationMatch>[],
): string[] {
  const long = missed
    .map((entry) => ({ entry, words: wordsOf(entry.sourceText).length }))
    .filter(({ words }) => words >= MIN_NEAR_MISS_WORDS);
  if (long.length === 0) return [];

  // The same line repeated is one candidate; each is found through the words
  // it holds, so an entry is only compared with lines sharing its rarer words.
  const candidates = [...new Map(candidatesIn(body, occurrences).map((c) => [c.key, c])).values()];
  const byWord = new Map<string, number[]>();
  candidates.forEach((candidate, index) => {
    for (const word of new Set(wordsOf(candidate.key))) {
      const holders = byWord.get(word);
      if (holders) holders.push(index);
      else byWord.set(word, [index]);
    }
  });
  const notices: string[] = [];
  let pairs = 0;
  for (const { entry, words } of long) {
    // As similar as a near miss has to be, a line lacks at most about a tenth
    // of the entry's words, so it holds at least one of these rarest ones,
    // whichever it changed.
    const own = [...new Set(wordsOf(entry.sourceKey))];
    const rarest = own
      .map((word) => byWord.get(word) ?? [])
      .sort((a, b) => a.length - b.length)
      .slice(0, Math.ceil(own.length * 0.2) + 1);
    const nearby = new Set(rarest.flat());
    // Missing a near miss loses a warning, nothing more: past a fixed amount
    // of work the check stops rather than hold the request.
    pairs += nearby.size;
    if (pairs > MAX_NEAR_MISS_PAIRS) break;
    let best: { key: string; likeness: number } | null = null;
    for (const index of nearby) {
      const candidate = candidates[index];
      // The Dice coefficient can't reach the threshold when the word counts are this far apart.
      const bound = (2 * Math.min(words, candidate.words)) / (words + candidate.words);
      // A candidate holding the entry's wording holds it where a longer entry took it.
      if (bound < MIN_SIMILARITY || candidate.key.includes(entry.sourceKey)) continue;
      const likeness = similarity(candidate.key, entry.sourceKey);
      if (likeness >= MIN_SIMILARITY && (!best || likeness > best.likeness)) best = { key: candidate.key, likeness };
    }
    if (!best) continue;
    const changed = changedWords(best.key, entry.sourceKey);
    notices.push(
      `"${entryLabel(entry)}" looks like a standard translation but differs (${changed} word${changed === 1 ? '' : 's'}); the AI translated it.`,
    );
  }
  return notices;
}
