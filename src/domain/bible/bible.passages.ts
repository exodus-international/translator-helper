import { parseReference, type VerseRange } from './lib/reference';
import { referenceFormat, renderReference, type Segment } from './lib/render';
import { mapVerse, type Address } from './lib/versification';
import type { BibleIndex, IndexTranslation, VerseRow } from './bible.index';
import {
  DEFAULT_INCLUDE,
  type Include,
  type PassageResult,
  type PassageStatus,
  type ReferenceCheck,
  type VerseDto,
} from './bible.types';

/**
 * Resolves references written against the source (RSV-CE) into a target
 * translation. Every miss is reported as a status, never papered over with a
 * guess: a wrong verse is worse than no verse. Port of bible-api
 * src/api/passages.ts.
 */

/** Longest passage one reference may ask for: Ps 119 is 176 verses, a whole Gospel is not a citation. */
export const MAX_VERSES_PER_REF = 300;

/**
 * Verses a caller may still read, shared by every reference of one request so
 * that many references cannot add up to the whole Bible. Charged before any
 * chapter is read, whether or not the reference then resolves.
 */
export class VerseBudget {
  constructor(public remaining: number) {}

  take(verses: number) {
    if (verses > this.remaining) throw new Miss('out_of_range', 'Too many verses in one request.');
    this.remaining -= verses;
  }
}

class Miss {
  constructor(
    public status: Exclude<PassageStatus, 'ok' | 'partial'>,
    public note?: string,
  ) {}
}

interface Passage {
  book: string;
  verses: VerseDto[];
  rendered: string;
  notes: string[];
  /** Notes that explain the result without anything requested missing. */
  remarks: string[];
}

export function unknownLanguage(ref: string, key: string): PassageResult {
  return { ref, status: 'unknown_language', notes: [`No Bible translation for '${key}'.`] };
}

export async function resolvePassage(
  index: BibleIndex,
  ref: string,
  target: IndexTranslation,
  include: Include = DEFAULT_INCLUDE,
  budget: VerseBudget = new VerseBudget(MAX_VERSES_PER_REF),
): Promise<PassageResult> {
  const source = index.source;
  if (!source) return { ref, status: 'unknown_language', notes: ['No source Bible (RSV-CE) has been imported.'] };
  const parsed = parseReference(ref, {
    singleChapter: (book) => index.sourceVerses.get(index.resolveBook(book, target) ?? '')?.size === 1,
  });
  if (!parsed) return { ref, status: 'unparseable', translation: target.code, notes: ['Not a Bible reference.'] };

  const passages: Passage[] = [];
  const sources: Passage[] = [];
  let firstBook: string | undefined;
  let length = 0;
  try {
    for (const p of parsed) {
      const usfm = index.resolveBook(p.book, target);
      if (!usfm) throw new Miss('unknown_book', `Unrecognised book '${p.book}'.`);
      firstBook ??= usfm;
      const addresses = expand(index, source, usfm, p.ranges);
      length += addresses.addresses.length;
      if (length > MAX_VERSES_PER_REF) {
        throw new Miss('out_of_range', `The passage covers more than ${MAX_VERSES_PER_REF} verses; cite a shorter one.`);
      }
      budget.take(addresses.addresses.length * (include.source && target.id !== source.id ? 2 : 1));
      passages.push(await fetchPassage(index, usfm, addresses, target));
      if (include.source && target.id !== source.id) sources.push(await fetchPassage(index, usfm, addresses, source));
    }
  } catch (err) {
    if (!(err instanceof Miss)) throw err;
    return {
      ref,
      status: err.status,
      translation: target.code,
      ...(firstBook && { book: firstBook }),
      notes: err.note ? [err.note] : [],
    };
  }

  const notes = passages.flatMap((p) => p.notes);
  const result: PassageResult = {
    ref,
    status: notes.length ? 'partial' : 'ok',
    translation: target.code,
    book: passages[0]!.book,
    notes: [...notes, ...passages.flatMap((p) => p.remarks)],
  };
  Object.assign(result, view(passages, target, include));
  if (include.source) {
    result.source = target.id === source.id ? view(passages, target, include) : view(sources, source, include);
  }
  return result;
}

/** Checks a reference against the source only: no target, no text. */
export async function validateReference(
  index: BibleIndex,
  ref: string,
  budget?: VerseBudget,
): Promise<ReferenceCheck> {
  if (!index.source) return { ref, status: 'unknown_language', notes: ['No source Bible (RSV-CE) has been imported.'] };
  const r = await resolvePassage(index, ref, index.source, { text: false, verses: false, rendered: true, source: false }, budget);
  return {
    ref,
    status: r.status,
    ...(r.book && { book: r.book }),
    ...(r.rendered && { normalized: r.rendered }),
    notes: r.notes,
  };
}

function view(passages: Passage[], tr: IndexTranslation, include: Include) {
  const verses = passages.flatMap((p) => p.verses);
  return {
    ...(include.rendered && { rendered: passages.map((p) => p.rendered).join(referenceFormat(tr.language).segmentSep) }),
    ...(include.text && { text: verses.map((v) => v.text).join(' ') }),
    ...(include.verses && { verses }),
  };
}

// ---------------------------------------------------------------------------

interface SourceAddresses {
  addresses: Address[];
  /** Source chapters requested without verses ("Ps 23"). */
  wholeChapters: Set<number>;
  notes: string[];
}

/** Expands parsed ranges into the source verses they cover. */
function expand(index: BibleIndex, source: IndexTranslation, usfm: string, ranges: VerseRange[]): SourceAddresses {
  const chapters = index.sourceVerses.get(usfm);
  if (!chapters) throw new Miss('out_of_range', `${usfm} is not in ${source.code}.`);
  const lastChapter = Math.max(...chapters.keys());
  const seen = new Set<number>();
  const out: SourceAddresses = { addresses: [], wholeChapters: new Set(), notes: [] };

  for (const r of ranges) {
    for (let c = r.fromChapter; c <= r.toChapter; c++) {
      if (c > lastChapter) {
        out.notes.push(`${usfm} ${c === r.toChapter ? c : `${c}-${r.toChapter}`} is not in ${source.code}.`);
        break;
      }
      const verses = chapters.get(c) ?? [];
      const from = c === r.fromChapter ? (r.fromVerse ?? 1) : 1;
      const to = c === r.toChapter ? (r.toVerse ?? Infinity) : Infinity;
      if (from === 1 && to === Infinity) out.wholeChapters.add(c);
      const present = verses.filter((v) => v >= from && v <= to);
      if (to !== Infinity) {
        const missing = rangesOf(numbersBetween(from, Math.min(to, from + 500)).filter((v) => !verses.includes(v)));
        if (missing.length) out.notes.push(`${usfm} ${c}:${missing.map(formatRun).join(',')} is not in ${source.code}.`);
      }
      for (const v of present) {
        const key = c * 10000 + v;
        if (seen.has(key)) continue;
        seen.add(key);
        out.addresses.push({ chapter: c, verse: v });
      }
    }
  }
  if (out.addresses.length === 0) throw new Miss('out_of_range', out.notes.join(' ') || `Nothing to resolve in ${usfm}.`);
  out.addresses.sort((a, b) => a.chapter - b.chapter || a.verse - b.verse);
  return out;
}

async function fetchPassage(
  index: BibleIndex,
  usfm: string,
  src: SourceAddresses,
  tr: IndexTranslation,
): Promise<Passage> {
  const source = index.source!;
  const book = index.findBook(tr, usfm);
  if (!book) throw new Miss('book_not_in_translation', `${tr.code} does not contain ${usfm}.`);
  if (!index.isDeclared(tr, usfm)) {
    throw new Miss('versification_unmapped', `No versification has been declared for ${usfm} in ${tr.code}.`);
  }

  const rows = tr.id === source.id ? [] : index.mappingRows(tr, usfm);
  const unmapped = new Set<number>();
  const mapped: Array<Address & { whole: boolean }> = [];
  for (const a of src.addresses) {
    const m = mapVerse(rows, a.chapter, a.verse);
    if (m) mapped.push({ ...m, whole: src.wholeChapters.has(a.chapter) });
    else unmapped.add(a.chapter);
  }
  if (unmapped.size) {
    throw new Miss(
      'versification_unmapped',
      `${usfm} ${[...unmapped].join(', ')} ${unmapped.size > 1 ? 'are' : 'is'} numbered differently in ${tr.code} and has no mapping yet.`,
    );
  }

  const chapters = new Map<number, Map<number, VerseRow>>();
  for (const c of new Set(mapped.map((a) => a.chapter))) chapters.set(c, await index.chapterText(book.id, c));

  const verses: VerseDto[] = [];
  const missing: Address[] = [];
  const merged: VerseDto[] = [];
  const seen = new Set<number>();
  for (const a of mapped) {
    const key = a.chapter * 10000 + a.verse;
    if (seen.has(key)) continue;
    seen.add(key);
    const row = chapters.get(a.chapter)!.get(a.verse);
    if (!row) {
      missing.push(a);
      continue;
    }
    const last = verses[verses.length - 1];
    if (last && last.chapter === a.chapter && last.verse === row.verse) continue; // rest of a merged row
    const dto: VerseDto = { id: `${usfm}.${a.chapter}.${row.verse}`, chapter: a.chapter, verse: row.verse, text: row.text };
    if (row.verse_end) {
      dto.id += `-${row.verse_end}`;
      dto.verse_end = row.verse_end;
      merged.push(dto);
    }
    verses.push(dto);
  }
  if (verses.length === 0) throw new Miss('out_of_range', `${usfm} ${formatAddresses(missing)} is not in ${tr.code}.`);

  const notes = [...src.notes];
  if (missing.length) notes.push(`${usfm} ${formatAddresses(missing)} is not in ${tr.code}.`);
  for (const v of merged) {
    for (let n = v.verse; n <= v.verse_end!; n++) {
      if (seen.has(v.chapter * 10000 + n)) continue;
      notes.push(`${tr.code} prints ${usfm} ${v.chapter}:${v.verse}-${v.verse_end} as one verse; returned as one block.`);
      break;
    }
  }

  // Whole chapters stay whole when every verse of the target chapter came from a whole source chapter.
  const whole = new Set<number>();
  const remarks: string[] = [];
  const uncovered: Address[] = [];
  for (const [c, text] of chapters) {
    if (!mapped.filter((a) => a.chapter === c).every((a) => a.whole)) continue;
    const left = [...text.keys()].filter((v) => !seen.has(c * 10000 + v));
    if (left.length === 0) whole.add(c);
    else uncovered.push(...left.map((verse) => ({ chapter: c, verse })));
  }
  // A whole source chapter that leaves target verses out (a numbered psalm title).
  if (uncovered.length) {
    remarks.push(`${tr.code} ${usfm} ${formatAddresses(uncovered)} has no counterpart in ${source.code} and is not included.`);
  }
  return {
    book: usfm,
    verses,
    rendered: renderReference(
      book.abbreviation,
      segments(verses, chapters, whole),
      referenceFormat(tr.language),
      index.sourceVerses.get(usfm)?.size === 1,
    ),
    notes,
    remarks,
  };
}

/** Groups verses into citation segments; a gap made only of verses the chapter lacks does not split a range. */
function segments(verses: VerseDto[], chapters: Map<number, Map<number, VerseRow>>, whole: Set<number>): Segment[] {
  const out: Segment[] = [];
  for (const v of verses) {
    let seg = out[out.length - 1];
    if (whole.has(v.chapter)) {
      if (seg && seg.ranges.length === 0 && (seg.toChapter ?? seg.chapter) === v.chapter) continue;
      if (seg && seg.ranges.length === 0 && (seg.toChapter ?? seg.chapter) === v.chapter - 1) seg.toChapter = v.chapter;
      else out.push({ chapter: v.chapter, ranges: [] });
      continue;
    }
    if (!seg || seg.chapter !== v.chapter || seg.ranges.length === 0) {
      seg = { chapter: v.chapter, ranges: [] };
      out.push(seg);
    }
    const last = seg.ranges[seg.ranges.length - 1];
    const existing = chapters.get(v.chapter)!;
    const to = v.verse_end ?? v.verse;
    if (last && numbersBetween(last.to + 1, v.verse - 1).every((n) => !existing.has(n))) last.to = to;
    else seg.ranges.push({ from: v.verse, to });
  }
  return out;
}

function numbersBetween(from: number, to: number): number[] {
  const out: number[] = [];
  for (let n = from; n <= to; n++) out.push(n);
  return out;
}

function rangesOf(numbers: number[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const n of numbers) {
    const last = out[out.length - 1];
    if (last && last[1] === n - 1) last[1] = n;
    else out.push([n, n]);
  }
  return out;
}

const formatRun = ([a, b]: [number, number]) => (a === b ? `${a}` : `${a}-${b}`);

function formatAddresses(addresses: Address[]): string {
  const byChapter = new Map<number, number[]>();
  for (const a of addresses) byChapter.set(a.chapter, [...(byChapter.get(a.chapter) ?? []), a.verse]);
  return [...byChapter].map(([c, vs]) => `${c}:${rangesOf(vs).map(formatRun).join(',')}`).join('; ');
}
