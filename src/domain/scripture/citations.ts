/**
 * Finding Scripture citations and the passages they quote, in a source or a
 * translation. Pure: no Bible, no DOM, so the editor, the Scripture check and
 * the automatic translation's reading placeholders share it.
 *
 * A match here is only a candidate. "Day 3,4" and "At 5:30" look like
 * citations; the Bible resolver decides (unknown_book, unparseable), so the
 * patterns can afford to be generous.
 */

// ─── Citations ────────────────────────────────────────────

export type CitationNotation = 'english' | 'target';

export interface Citation {
  /** The citation as written, whitespace collapsed: what goes to the resolver. */
  text: string;
  /** As written, for finding it again. */
  raw: string;
  from: number;
  to: number;
  /**
   * `english` is RSV-CE numbering by convention ("John 3:16"); `target` is the
   * continental "Iv 3,16", which may already use the target Bible's numbering.
   */
  notation: CitationNotation;
}

// Spaces only, never a newline: a book at the end of one line and a number
// at the start of the next are not a citation.
const SP = '[ \\u00a0]';
// "1 Kor", "I John", "2. Mojż", "Song of Songs", "Ps.", "Žid"; a single letter
// too ("J 3,16" is Czech for John).
const BOOK = String.raw`(?:(?:[1-4]|IV|I{1,3})\.?${SP}?)?\p{Lu}\p{Ll}*\.?(?:${SP}of(?:${SP}the)?${SP}\p{Lu}\p{Ll}+)?`;
const DASH = String.raw`${SP}?[-–]${SP}?`;
// English: "3:16", "3:16-18", "3:16-4:2", then ", 20", "; 4:1". A continuation
// that is the number of the next book ("; 2 Peter") is left alone.
const EN_RANGE = String.raw`\d{1,3}(?::\d{1,3})?[a-z]?(?:${DASH}\d{1,3}(?::\d{1,3})?[a-z]?)?`;
const ENGLISH = String.raw`\d{1,3}:\d{1,3}[a-z]?(?:${DASH}\d{1,3}(?::\d{1,3})?[a-z]?)?(?:${SP}?[,;]${SP}?${EN_RANGE}(?![\d:]|${SP}?\p{Lu}))*`;
// Continental: "3,16", "3,16-18", "3,16-4,2", ".20" for a verse list and
// "; 6,1" for another chapter.
const EU_VERSES = String.raw`\d{1,3}[a-z]?(?:${DASH}\d{1,3}(?:,\d{1,3})?[a-z]?)?(?:\.\d{1,3}[a-z]?(?:[-–]\d{1,3}[a-z]?)?)*`;
const CONTINENTAL = String.raw`\d{1,3},${EU_VERSES}(?:;${SP}?\d{1,3},${EU_VERSES})*`;

const CITATION = new RegExp(
  String.raw`(?<![\p{L}\p{N}])${BOOK}${SP}?(?:${ENGLISH}|${CONTINENTAL})(?![\p{L}\p{N}])`,
  'gu',
);

export const normalizeCitation = (citation: string) => citation.replace(/\s+/g, ' ').trim();

/**
 * Two ways of writing the same citation compare equal: spacing, case and the
 * kind of dash do not matter ("Iv 3, 16–18" is "Iv 3,16-18").
 */
export const citationKey = (citation: string) =>
  citation
    .normalize('NFC')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/[\s.]+/g, '');

/** Every candidate citation in the text, in order. */
export function findCitations(text: string): Citation[] {
  const out: Citation[] = [];
  for (const match of text.matchAll(CITATION)) {
    const from = match.index;
    const raw = match[0];
    out.push({
      text: normalizeCitation(raw),
      raw,
      from,
      to: from + raw.length,
      notation: raw.includes(':') ? 'english' : 'target',
    });
  }
  return out;
}

// ─── Readings ─────────────────────────────────────────────

export interface Reading {
  citation: string;
  /** Line indexes of the italic text, end exclusive. */
  start: number;
  end: number;
  /** The source prints a verse per line rather than one paragraph. */
  linePerVerse: boolean;
  text: string;
}

const READING_END = /^\s*(?:#{1,6}\s|<span\b|(?:-{3,}|\*{3,})\s*$)/;

/**
 * The reading's text after line `line`: up to the next heading, citation line
 * or rule. It may hold elisions (". . .") and plain paragraphs between the
 * italic ones, so it is never cut at the first one. It must start in italics.
 */
export function readingAfter(lines: string[], citation: string, line: number): Reading | null {
  let start = line + 1;
  while (start < lines.length && !lines[start].trim()) start++;
  if (!/^[*_]/.test(lines[start]?.trim() ?? '')) return null;
  let end = start;
  for (let i = start; i < lines.length && !READING_END.test(lines[i]); i++) {
    if (lines[i].trim()) end = i + 1;
  }
  const text = lines.slice(start, end).filter((l) => l.trim());
  return { citation, start, end, linePerVerse: text.length > 1, text: text.join(' ') };
}

const escapeMarkdown = (text: string) => text.replace(/([\\*_`])/g, '\\$1');

/** Verses as an italic reading block, a verse per line when the document had one. */
export function formatReading(verses: string[], linePerVerse: boolean): string {
  const lines = verses.map((v) => escapeMarkdown(v.replace(/\s+/g, ' ').trim()));
  return `*${lines.join(linePerVerse ? '\n' : ' ')}*`;
}

/** Official text for inside a quotation: one line, Markdown escaped. */
export const formatInlineQuote = (verses: string[]) =>
  escapeMarkdown(verses.map((v) => v.replace(/\s+/g, ' ').trim()).join(' '));

/** What a reader sees of Markdown text: no emphasis markers, no escapes, no tags. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/<[^>]*>/g, ' ')
    .replace(/\\([\\*_`])|[*_]+/g, (_marker, escaped?: string) => escaped ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── The passage a citation quotes ────────────────────────

export interface QuotedText {
  /** `reading`: the italic block under a citation line; `quote`: a quotation beside the citation. */
  kind: 'reading' | 'quote';
  from: number;
  to: number;
  /** The text as written, Markdown and all. */
  raw: string;
  /** What a reader sees. */
  plain: string;
  /** A reading printed a verse per line. */
  linePerVerse: boolean;
}

// Closing mark → the opening marks it closes, for English, Croatian, German,
// Hungarian, Czech, Slovak and Slovene typography.
const OPENERS: Record<string, string[]> = {
  '"': ['"'],
  '”': ['“', '„'],
  '“': ['„'],
  '«': ['»'],
  '»': ['«'],
  '’': ['‘', '‚'],
  '‘': ['‚'],
};
const CLOSERS: Record<string, string[]> = {};
for (const [close, opens] of Object.entries(OPENERS)) {
  for (const open of opens) (CLOSERS[open] ??= []).push(close);
}

// What may stand between a quotation and its citation: `" — Ps 46:10`,
// `" (Iv 3,16)`, `Iv 3,16: „…“`, and emphasis around either.
const GAP_BEFORE = /[\s—–\-(,:*_]*$/u;
const GAP_AFTER = /^[\s—–\-):,*_]*/u;
const MAX_GAP = 6;

function lineBounds(text: string, from: number, to: number) {
  const start = text.lastIndexOf('\n', from - 1) + 1;
  const newline = text.indexOf('\n', to);
  return { start, end: newline === -1 ? text.length : newline };
}

/** A line that holds the citation and nothing a reader would read besides it. */
function isCitationLine(line: string, citation: string): boolean {
  const rest = line.replace(citation, ' ').replace(/<[^>]*>/g, ' ');
  return !/[\p{L}\p{N}]/u.test(rest) && line.includes(citation);
}

function quoted(text: string, from: number, to: number, kind: QuotedText['kind'], linePerVerse = false): QuotedText {
  const raw = text.slice(from, to);
  return { kind, from, to, raw, plain: plainText(raw), linePerVerse };
}

/**
 * The passage the citation at `citation` quotes, if the document quotes one: the
 * reading under a line that holds only the citation (as automatic translation
 * finds readings), or a quotation right before or after an inline citation. The range
 * is the text inside the quotation marks, or the reading's italic lines.
 */
export function findQuotedText(text: string, citation: Pick<Citation, 'from' | 'to'>): QuotedText | null {
  const { start, end } = lineBounds(text, citation.from, citation.to);
  const line = text.slice(start, end);
  const written = text.slice(citation.from, citation.to);

  if (isCitationLine(line, written)) {
    const lines = text.split('\n');
    const lineIndex = text.slice(0, start).split('\n').length - 1;
    const reading = readingAfter(lines, written, lineIndex);
    if (!reading) return null;
    const lineStart = (index: number) => lines.slice(0, index).reduce((sum, l) => sum + l.length + 1, 0);
    const to = lineStart(reading.end - 1) + lines[reading.end - 1].length;
    return quoted(text, lineStart(reading.start), to, 'reading', reading.linePerVerse);
  }

  // A quotation that ends just before the citation.
  const before = text.slice(start, citation.from);
  const gapBefore = before.match(GAP_BEFORE)?.[0] ?? '';
  const closeAt = before.length - gapBefore.length - 1;
  if (gapBefore.length <= MAX_GAP && closeAt > 0) {
    const openers = OPENERS[before[closeAt]];
    if (openers) {
      const openAt = Math.max(...openers.map((o) => before.lastIndexOf(o, closeAt - 1)));
      if (openAt >= 0 && closeAt - openAt > 1) return quoted(text, start + openAt + 1, start + closeAt, 'quote');
    }
  }

  // A quotation that starts just after it.
  const after = text.slice(citation.to, end);
  const gapAfter = after.match(GAP_AFTER)?.[0] ?? '';
  const openAt = gapAfter.length;
  if (gapAfter.length <= MAX_GAP && openAt < after.length) {
    const closers = CLOSERS[after[openAt]];
    if (closers) {
      const closes = closers.map((c) => after.indexOf(c, openAt + 1)).filter((i) => i > openAt + 1);
      if (closes.length) {
        return quoted(text, citation.to + openAt + 1, citation.to + Math.min(...closes), 'quote');
      }
    }
  }
  return null;
}

// ─── Comparing texts ──────────────────────────────────────

const words = (text: string) => text.toLowerCase().match(/\p{L}+/gu) ?? [];

/** How much two texts share their words, from 0 to 1 (the Dice coefficient over word counts). */
export function similarity(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  if (wa.length + wb.length === 0) return 1;
  const counts = new Map<string, number>();
  for (const w of wa) counts.set(w, (counts.get(w) ?? 0) + 1);
  let shared = 0;
  for (const w of wb) {
    const n = counts.get(w) ?? 0;
    if (n > 0) {
      shared++;
      counts.set(w, n - 1);
    }
  }
  return (2 * shared) / (wa.length + wb.length);
}

/** The same words in the same order, whatever the spacing. */
export const sameText = (a: string, b: string) => normalizeCitation(a) === normalizeCitation(b);

export interface DiffPart {
  /** `delete`: only in the document; `insert`: only in the official text. */
  type: 'equal' | 'insert' | 'delete';
  text: string;
}

// Past this many cells the table costs more than the diff is worth; the
// texts are then shown as one replacement.
const MAX_DIFF_CELLS = 400_000;

/**
 * A word diff from the document's text to the official one. Words are compared
 * as written, punctuation included: an official text is quoted exactly.
 */
export function diffWords(current: string, official: string): DiffPart[] {
  const a = current.split(/\s+/).filter(Boolean);
  const b = official.split(/\s+/).filter(Boolean);
  const parts: DiffPart[] = [];
  const push = (type: DiffPart['type'], word: string) => {
    const last = parts[parts.length - 1];
    if (last?.type === type) last.text += ` ${word}`;
    else parts.push({ type, text: word });
  };

  if (a.length * b.length > MAX_DIFF_CELLS) {
    a.forEach((w) => push('delete', w));
    b.forEach((w) => push('insert', w));
    return parts;
  }

  // Longest common subsequence, filled from the end so the walk runs forwards.
  const width = b.length + 1;
  const lcs = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[i] === b[j] ? lcs[(i + 1) * width + j + 1] + 1 : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('equal', a[i]);
      i++;
      j++;
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
      push('delete', a[i++]);
    } else {
      push('insert', b[j++]);
    }
  }
  while (i < a.length) push('delete', a[i++]);
  while (j < b.length) push('insert', b[j++]);
  return parts;
}
