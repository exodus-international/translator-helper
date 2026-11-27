/**
 * Finding standard translations in a document, and deciding for each place
 * whether AI translation copies the entry as written or treats it as a term
 * whose form the grammar may change ("Započni znakom križa", not "znak
 * križa"). Matching runs in the simplified form (`toMatchForm`); the decision
 * reads the raw text around each match, where the layout still is.
 *
 * Pure and free of server imports: AI translation and the editor share it.
 */

import { toMatchForm } from './match-form';

export interface MatchableEntry {
  sourceKey: string;
  fixedForm: boolean;
  sourceProjectId: string | null;
}

export type OccurrenceKind = 'verbatim' | 'term';

export interface Occurrence<E extends MatchableEntry> {
  entry: E;
  /** Raw offsets of the matched wording: its first character and one past its last; prefixes and wrapping emphasis around it are outside. */
  from: number;
  to: number;
  kind: OccurrenceKind;
  /**
   * When the match is the whole content of the lines it touches (from the first content character of its
   * first line, after prefixes and opening emphasis, to the last of its last line, before closing emphasis,
   * trailing comments and hard breaks): the raw span of those full lines, from the first line's start to
   * the last line's end (excluding its newline). Null otherwise. AI translation replaces such an
   * occurrence line by line and re-applies the layout; an inline one is replaced as a span.
   */
  lines: { from: number; to: number } | null;
}

interface Span {
  from: number;
  to: number;
}

/** The raw text, with the comments in it looked up per character. */
interface Raw {
  text: string;
  comments: Span[];
  commentOf: Int32Array;
  /** For each position, where its line starts and ends: read once, so a match on a long line doesn't rescan it. */
  lineStart: Int32Array;
  lineEnd: Int32Array;
}

// Zero-width and format characters read as space, as in the match form: a
// word joiner sits inside a pause comment in real documents.
const BLANK = /[\s​-‍⁠﻿]/u;
const WORD = /[\p{L}\p{M}\p{N}]/u;
const LETTER = /\p{L}/u;
const TERMINAL = new Set(['.', '!', '?', '…']);

/**
 * A dot after these is part of the word, not the end of a sentence: "Pray to
 * St. Joseph" doesn't start a sentence at "Joseph". Kept small on purpose: a
 * missing one turns a verbatim occurrence into a term, which the grammar
 * check still covers; a wrong one would paste a fixed form into a sentence.
 */
const ABBREVIATIONS = new Set([
  ...['st', 'sts', 'fr', 'br', 'sr', 'mr', 'mrs', 'dr', 'rev', 'msgr'],
  ...['cf', 'e.g', 'i.e', 'vs'],
]);

/** Each opening quotation mark and the marks that close it, in the typographies the content uses. */
const CLOSING = new Map<string, string>([
  ['“', '”'],
  ['„', '“”'],
  ['«', '»'],
  ['»', '«'],
  ['"', '"'],
  ['‘', '’'],
  ['‚', '‘’'],
  ["'", "'"],
  ['‹', '›'],
  ['›', '‹'],
  ['”', '”'],
]);
const QUOTES = new Set([...CLOSING].flatMap(([open, close]) => [open, ...close]));

const isBlank = (char: string) => BLANK.test(char);
const isEmphasis = (char: string | undefined) => char === '*' || char === '_';
const isQuote = (char: string | undefined) => char !== undefined && QUOTES.has(char);
const isDigit = (char: string | undefined) => char !== undefined && char >= '0' && char <= '9';

// ─── Matching ─────────────────────────────────────────────

/**
 * Every place an entry occurs in `text`, sorted by `from`. The caller passes
 * the general entries and those of the document's project; where both have
 * the same source, the project's wins. The longest match wins and matches
 * never overlap; between overlapping matches of the same length, the entry
 * listed first wins.
 */
export function findOccurrences<E extends MatchableEntry>(text: string, entries: readonly E[]): Occurrence<E>[] {
  const { key, map } = toMatchForm(text);
  const raw = readRaw(text);
  const placeholders = placeholderCounts(text);
  // Longest first, so a match only has to check its own ends against the
  // matches taken before it: one at least as long that overlapped it would
  // cover one of them.
  const taken = new Uint8Array(key.length);
  const occurrences: Occurrence<E>[] = [];
  for (const entry of preferred(entries)) {
    const length = entry.sourceKey.length;
    for (let at = key.indexOf(entry.sourceKey); at !== -1; at = key.indexOf(entry.sourceKey, at + 1)) {
      const end = at + length;
      if (taken[at] || taken[end - 1] || !onWordBoundaries(key, at, end)) continue;
      const from = map[at];
      const to = map[end - 1] + 1;
      if (placeholders[to] > placeholders[from]) continue;
      taken.fill(1, at, end);
      const kind = entry.fixedForm || standsAlone(raw, from, to) ? 'verbatim' : 'term';
      occurrences.push({ entry, from, to, kind, lines: wholeLines(raw, from, to) });
    }
  }
  return occurrences.sort((a, b) => a.from - b.from);
}

/** One entry per source, the project's over the general one, longest first; an empty source matches nothing. */
function preferred<E extends MatchableEntry>(entries: readonly E[]): E[] {
  const bySource = new Map<string, E>();
  for (const entry of entries) {
    if (!entry.sourceKey) continue;
    const held = bySource.get(entry.sourceKey);
    const outranks = !held || (held.sourceProjectId === null && entry.sourceProjectId !== null);
    if (outranks) bySource.set(entry.sourceKey, entry);
  }
  return [...bySource.values()].sort((a, b) => b.sourceKey.length - a.sourceKey.length);
}

/** "Amen" is not in "Amens": the key characters just outside a match aren't part of a word. */
function onWordBoundaries(key: string, from: number, to: number): boolean {
  const before = from > 1 && /[\uDC00-\uDFFF]/.test(key[from - 1]) ? key.slice(from - 2, from) : key[from - 1];
  const after = key.codePointAt(to);
  const wordBefore = before !== undefined && WORD.test(before);
  return !wordBefore && !(after !== undefined && WORD.test(String.fromCodePoint(after)));
}

/**
 * How many characters of `{{name:n}}` placeholders lie before each raw index.
 * Scripture is swapped for `{{bible:n}}` before this runs and takes precedence,
 * so a match that overlaps one is no match.
 */
function placeholderCounts(text: string): Int32Array {
  const marked = new Uint8Array(text.length);
  for (let open = text.indexOf('{{'); open !== -1; ) {
    const end = placeholderEnd(text, open);
    if (end !== -1) marked.fill(1, open, end);
    open = text.indexOf('{{', end === -1 ? open + 2 : end);
  }
  const counts = new Int32Array(text.length + 1);
  for (let i = 0; i < text.length; i++) counts[i + 1] = counts[i] + marked[i];
  return counts;
}

/** One past the `{{name:n}}` that starts at `open`, or -1. */
function placeholderEnd(text: string, open: number): number {
  let i = open + 2;
  while (text[i] >= 'a' && text[i] <= 'z') i++;
  if (i === open + 2 || text[i] !== ':') return -1;
  const digits = ++i;
  while (isDigit(text[i])) i++;
  return i > digits && text.startsWith('}}', i) ? i + 2 : -1;
}

// ─── Layout around a match ────────────────────────────────

/**
 * The text with its comments and lines indexed. Comments are found with
 * indexOf, not a lazy regex: one that is never closed would make that rescan
 * to the end from every `<!--`.
 */
function readRaw(text: string): Raw {
  const comments: Span[] = [];
  const commentOf = new Int32Array(text.length).fill(-1);
  for (let open = text.indexOf('<!--'); open !== -1; ) {
    const close = text.indexOf('-->', open + 4);
    if (close === -1) break;
    commentOf.fill(comments.length, open, close + 3);
    comments.push({ from: open, to: close + 3 });
    open = text.indexOf('<!--', close + 3);
  }
  const lineStart = new Int32Array(text.length + 1);
  const lineEnd = new Int32Array(text.length + 1);
  for (let start = 0; start <= text.length; ) {
    const newline = text.indexOf('\n', start);
    const end = newline === -1 ? text.length : newline;
    lineStart.fill(start, start, end + 1);
    lineEnd.fill(end, start, end + 1);
    start = end + 1;
  }
  return { text, comments, commentOf, lineStart, lineEnd };
}

/** The start of the line holding `at`; a position just after a newline is on the next line. */
const lineStartOf = (raw: Raw, at: number) => raw.lineStart[at];
/** The end of the line holding `at`: its newline, or the end of the text. */
const lineEndOf = (raw: Raw, at: number) => raw.lineEnd[at];

function skipSpaces(text: string, at: number): number {
  let i = at;
  while (text[i] === ' ' || text[i] === '\t') i++;
  return i;
}

/** Where a line's wording starts: after its indentation, `>`s, and a list marker or `#`s, as the match form reads them. */
function contentStart(text: string, lineStart: number): number {
  let i = skipSpaces(text, lineStart);
  while (text[i] === '>') i = skipSpaces(text, i + 1);
  return markerEnd(text, i);
}

/** Past a list marker or heading at `at` and the spaces after it, or `at` when there is none. */
function markerEnd(text: string, at: number): number {
  let i = at;
  if (text[i] === '-' || text[i] === '*' || text[i] === '+') i++;
  else if (text[i] === '#') while (text[i] === '#' && i - at < 6) i++;
  else {
    while (isDigit(text[i]) && i - at < 9) i++;
    if (i === at || (text[i] !== '.' && text[i] !== ')')) return at;
    i++;
  }
  // "#hashtag", "*Amen*" and "1.5" are wording.
  if (i < text.length && text[i] !== '\n' && text[i] !== ' ' && text[i] !== '\t') return at;
  return skipSpaces(text, i);
}

/** Back from `at` to `limit` over the characters `skip` accepts and over comments. */
function skipBack(raw: Raw, at: number, limit: number, skip: (char: string) => boolean): number {
  let i = at;
  while (i > limit) {
    const comment = raw.comments[raw.commentOf[i - 1]];
    if (comment) i = Math.max(comment.from, limit);
    else if (skip(raw.text[i - 1])) i--;
    else break;
  }
  return i;
}

/** Forward from `at` to `limit` (a line end) over what `skip` accepts, comments, and a hard-break backslash. */
function skipForward(raw: Raw, at: number, limit: number, skip: (char: string) => boolean): number {
  let i = at;
  while (i < limit) {
    const comment = raw.comments[raw.commentOf[i]];
    if (comment) i = Math.min(comment.to, limit);
    else if (skip(raw.text[i]) || (raw.text[i] === '\\' && i === limit - 1)) i++;
    else break;
  }
  return i;
}

/** Emphasis and space: what may stand between a line's prefix and its wording without being wording. */
const isWrapping = (char: string) => isEmphasis(char) || isBlank(char);
/** Around a match on its own, quotation marks also stand outside the sentence: `"Amen.` starts one. */
const isOpening = (char: string) => isWrapping(char) || isQuote(char);

/** The emphasis delimiters in a stretch of a line, comments left out. */
function emphasisIn(text: string, from: number, to: number): string {
  let out = '';
  for (let i = from; i < to; i++) {
    if (text.startsWith('<!--', i)) {
      const close = text.indexOf('-->', i + 4);
      if (close === -1 || close >= to) break;
      i = close + 2;
    } else if (isEmphasis(text[i])) out += text[i];
  }
  return out;
}

/**
 * The match is the whole content of its lines: the span of those lines, else
 * null. The emphasis before it on its first line has to close after it on its
 * last line: a prayer line opening an italic paragraph has the paragraph's `*`
 * before it and none after, and replacing the line would take that `*` along,
 * leaving the paragraph's italics unbalanced. Such a match stays inline.
 */
function wholeLines(raw: Raw, from: number, to: number): Span | null {
  const first = lineStartOf(raw, from);
  const last = lineEndOf(raw, to);
  const content = contentStart(raw.text, first);
  if (skipBack(raw, from, content, isWrapping) > content) return null;
  if (skipForward(raw, to, last, isWrapping) < last) return null;
  const opening = emphasisIn(raw.text, content, from);
  const closing = emphasisIn(raw.text, to, last);
  if (opening !== [...closing].reverse().join('')) return null;
  return { from: first, to: last };
}

// ─── Verbatim or term ─────────────────────────────────────

/**
 * Whether the match is grammatically on its own (the issue's table), so the
 * entry can be pasted as written: it starts at a line, a sentence or after a
 * colon, and ends at a line or a sentence; or a quotation wraps exactly it.
 * Italics alone don't count: the content italicises words inside sentences.
 */
function standsAlone(raw: Raw, from: number, to: number): boolean {
  return quotedAlone(raw.text, from, to) || (startsAlone(raw, from) && endsAlone(raw, to));
}

/** `Pray the "Hail Mary" ten times.`: an opening quotation mark before it and its closing one after, emphasis aside. */
function quotedAlone(text: string, from: number, to: number): boolean {
  let before = from;
  while (isEmphasis(text[before - 1])) before--;
  let after = to;
  while (isEmphasis(text[after])) after++;
  const closing = CLOSING.get(text[before - 1]);
  return closing !== undefined && after < text.length && closing.includes(text[after]);
}

/** At the start of a line or heading, of a sentence, or after a colon (`Pray:`). */
function startsAlone(raw: Raw, from: number): boolean {
  const content = contentStart(raw.text, lineStartOf(raw, from));
  const i = skipBack(raw, from, content, isOpening);
  return i <= content || raw.text[i - 1] === ':' || endsSentenceAt(raw.text, i - 1);
}

/** At the end of a line or heading, or of a sentence. */
function endsAlone(raw: Raw, to: number): boolean {
  const end = lineEndOf(raw, to);
  return skipForward(raw, to, end, isOpening) >= end || endsSentenceAfter(raw, to);
}

/**
 * The match ends with, or is followed by (emphasis aside), the punctuation
 * that ends a sentence, and that punctuation is followed by a space, a closing
 * mark, a comment or nothing: "3.14" and "Amen.Next" end no sentence.
 */
function endsSentenceAfter(raw: Raw, to: number): boolean {
  const { text } = raw;
  let i = to;
  if (!endsSentenceAt(text, to - 1)) {
    while (isEmphasis(text[i])) i++;
    if (!endsSentenceAt(text, i)) return false;
    i++;
  }
  while (TERMINAL.has(text[i])) i++;
  return i === text.length || isBlank(text[i]) || isEmphasis(text[i]) || isQuote(text[i]) || raw.commentOf[i] !== -1;
}

/** `text[at]` ends a sentence: `.` `!` `?` or `…`, but not the dot of an abbreviation. */
function endsSentenceAt(text: string, at: number): boolean {
  if (!TERMINAL.has(text[at])) return false;
  if (text[at] !== '.') return true;
  // The word before the dot, inner dots included ("e.g").
  let start = at;
  while (start > 0 && (text[start - 1] === '.' || LETTER.test(text[start - 1]))) start--;
  return !ABBREVIATIONS.has(text.slice(start, at).toLowerCase());
}
