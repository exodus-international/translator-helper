import type { BibleTranslationDto, listBooks } from '@/domain/bible/bible.service';
import type { PassageStatus } from '@/domain/bible/bible.types';

/**
 * Pure helpers behind the Bible admin pages: coverage, verse-count comparison,
 * plain-language descriptions of mapping rows and reference splitting.
 */

export type BibleBooks = NonNullable<Awaited<ReturnType<typeof listBooks>>>;
export type BibleBook = BibleBooks['books'][number];
export type Coverage = BibleTranslationDto['versification'];

export interface MappingRowView {
  id: string;
  srcChapter: number;
  srcVerseFrom: number | null;
  srcVerseTo: number | null;
  dstChapter: number;
  offset: number;
  unmappable: boolean;
}

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive';

const integer = new Intl.NumberFormat('en-US');

export function formatCount(n: number): string {
  return integer.format(n);
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${formatCount(n)} ${n === 1 ? one : many}`;
}

function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((Math.min(part, whole) / whole) * 100);
}

export interface CoverageSummary {
  declaredPercent: number;
  reviewedPercent: number;
  /** Books the resolver will not answer for, because nobody has declared their numbering. */
  undeclaredBooks: number;
  /** Every book is declared and checked, with nothing left unmappable. */
  complete: boolean;
  label: string;
}

export function summarizeCoverage(c: Coverage): CoverageSummary {
  const undeclaredBooks = Math.max(0, c.presentBooks - c.declaredBooks);
  const parts = [`${c.declaredBooks} of ${c.presentBooks} books declared`, `${c.reviewedBooks} reviewed`];
  if (c.unmappableChapters > 0) parts.push(pluralize(c.unmappableChapters, 'unmappable chapter'));
  return {
    declaredPercent: percent(c.declaredBooks, c.presentBooks),
    reviewedPercent: percent(c.reviewedBooks, c.presentBooks),
    undeclaredBooks,
    complete:
      c.presentBooks > 0 && undeclaredBooks === 0 && c.reviewedBooks >= c.presentBooks && c.unmappableChapters === 0,
    label: parts.join(', '),
  };
}

export interface ChapterComparison {
  chapter: number;
  /** Verses RSV-CE has in this chapter; null when the source lacks it. */
  source: number | null;
  /** Verses the target prints; null when the target lacks it. */
  target: number | null;
  /** Target minus source; null when one side is missing. */
  delta: number | null;
  differs: boolean;
  unmappable: boolean;
  mapped: boolean;
}

/** One row per chapter either side has, flagging where the numbering may disagree. */
export function compareChapters(
  book: Pick<BibleBook, 'chapterVerseCounts' | 'sourceChapterVerseCounts' | 'unmappableChapters' | 'mappedChapters'>,
): ChapterComparison[] {
  const count = Math.max(book.chapterVerseCounts.length, book.sourceChapterVerseCounts.length);
  const unmappable = new Set(book.unmappableChapters);
  const mapped = new Set(book.mappedChapters);
  return Array.from({ length: count }, (_, i) => {
    // A zero count means the chapter is absent on that side (gaps in the array are zeros).
    const source = book.sourceChapterVerseCounts[i] || null;
    const target = book.chapterVerseCounts[i] || null;
    const delta = source !== null && target !== null ? target - source : null;
    return {
      chapter: i + 1,
      source,
      target,
      delta,
      differs: delta === null ? source !== target : delta !== 0,
      unmappable: unmappable.has(i + 1),
      mapped: mapped.has(i + 1),
    };
  });
}

/** Chapters whose counts differ and that nobody has mapped or marked unmappable yet. */
export function unhandledChapters(rows: ChapterComparison[]): ChapterComparison[] {
  return rows.filter((r) => r.differs && !r.mapped && !r.unmappable);
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0';
}

/** "Source 51:1–19 → target 51, verse +2": what a mapping row does, in one line. */
export function describeMapping(row: Omit<MappingRowView, 'id'>): string {
  const range =
    row.srcVerseFrom === null
      ? `${row.srcChapter}`
      : row.srcVerseTo === null
        ? `${row.srcChapter}:${row.srcVerseFrom}–end`
        : row.srcVerseTo === row.srcVerseFrom
          ? `${row.srcChapter}:${row.srcVerseFrom}`
          : `${row.srcChapter}:${row.srcVerseFrom}–${row.srcVerseTo}`;
  const scope = row.srcVerseFrom === null ? `Source chapter ${range}` : `Source ${range}`;
  if (row.unmappable) return `${scope} is unmappable: references to it are not resolved`;
  const verses = row.offset === 0 ? 'same verse numbers' : `verse ${signed(row.offset)}`;
  return `${scope} → target ${row.dstChapter}, ${verses}`;
}

export interface BookStatus {
  label: string;
  variant: BadgeVariant;
  /** A book the resolver answers for. */
  resolvable: boolean;
}

export function bookStatus(
  book: Pick<BibleBook, 'declared' | 'reviewed' | 'unmappableChapters'>,
  role: 'source' | 'target',
): BookStatus {
  if (role === 'source') return { label: 'Source', variant: 'outline', resolvable: true };
  if (!book.declared) return { label: 'Not declared', variant: 'destructive', resolvable: false };
  const n = book.unmappableChapters.length;
  if (n > 0) return { label: pluralize(n, 'unmappable chapter'), variant: 'warning', resolvable: true };
  if (book.reviewed) return { label: 'Reviewed', variant: 'success', resolvable: true };
  return { label: 'Declared', variant: 'secondary', resolvable: true };
}

const STATUS_LABELS: Record<PassageStatus, { label: string; variant: BadgeVariant }> = {
  ok: { label: 'OK', variant: 'success' },
  partial: { label: 'Partial', variant: 'warning' },
  unparseable: { label: 'Not a reference', variant: 'destructive' },
  unknown_book: { label: 'Unknown book', variant: 'destructive' },
  unknown_language: { label: 'Unknown language', variant: 'destructive' },
  book_not_in_translation: { label: 'Book missing', variant: 'destructive' },
  versification_unmapped: { label: 'Versification unmapped', variant: 'warning' },
  out_of_range: { label: 'Out of range', variant: 'destructive' },
};

export function passageStatusBadge(status: PassageStatus) {
  return STATUS_LABELS[status];
}

const STARTS_WITH_BOOK = /^\d?\s*\p{L}/u;

/**
 * Splits playground input into references: one per line, and at a ';' that
 * starts a new book. A ';' followed by a bare number stays, because the parser
 * reads "Rom 8:28; 30" as one reference continuing chapter 8.
 */
export function splitReferences(input: string): string[] {
  const out: string[] = [];
  for (const line of input.split(/\r?\n/)) {
    let current = '';
    for (const part of line.split(';')) {
      const piece = part.trim();
      if (!piece) continue;
      if (current && STARTS_WITH_BOOK.test(piece)) {
        out.push(current);
        current = piece;
      } else {
        current = current ? `${current}; ${piece}` : piece;
      }
    }
    if (current) out.push(current);
  }
  return out;
}

/** `sar-hr.json`, `sar-hr.json.gz` or `sar-hr.versification.json` → `sar-hr`. */
export function codeFromFileName(name: string): string | null {
  const base = name
    .toLowerCase()
    .replace(/\.gz$/, '')
    .replace(/\.json$/, '')
    .replace(/[._-]?versification$/, '');
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(base) && base.length >= 2 && base.length <= 40 ? base : null;
}

/**
 * Gzips a file in the browser so a 7 MB Bible travels as ~2 MB. Falls back to
 * the raw file where CompressionStream is missing; the server accepts both.
 */
export async function gzipFile(file: Blob, name: string): Promise<{ blob: Blob; name: string; compressed: boolean }> {
  if (name.endsWith('.gz') || typeof CompressionStream === 'undefined') return { blob: file, name, compressed: false };
  const stream = file.stream().pipeThrough(new CompressionStream('gzip'));
  const blob = await new Response(stream).blob();
  return { blob, name: `${name}.gz`, compressed: true };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export interface VerseLike {
  verse: number;
  verse_end?: number;
  text: string;
}

export interface AlignedCell {
  /** "3" or "3–4" for verses the translation prints as one. */
  label: string;
  text: string;
  /** This number is inside a merged verse that started on an earlier row. */
  continued: boolean;
}

export interface AlignedRow {
  verse: number;
  source: AlignedCell | null;
  target: AlignedCell | null;
}

function cellsByNumber(verses: VerseLike[]): Map<number, AlignedCell> {
  const out = new Map<number, AlignedCell>();
  for (const v of verses) {
    const end = v.verse_end ?? v.verse;
    const label = end > v.verse ? `${v.verse}–${end}` : `${v.verse}`;
    for (let n = v.verse; n <= end; n++) out.set(n, { label, text: v.text, continued: n !== v.verse });
  }
  return out;
}

/**
 * Lines two chapters up by verse number, so a shifted numbering shows as text
 * that stops matching from one row on, and a missing verse as an empty cell.
 */
export function alignVerses(source: VerseLike[], target: VerseLike[]): AlignedRow[] {
  const a = cellsByNumber(source);
  const b = cellsByNumber(target);
  const numbers = [...new Set([...a.keys(), ...b.keys()])].sort((x, y) => x - y);
  return numbers.map((verse) => ({ verse, source: a.get(verse) ?? null, target: b.get(verse) ?? null }));
}
