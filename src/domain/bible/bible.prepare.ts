import { ABBREVIATIONS } from './lib/abbreviations';
import { alignToCanon } from './lib/canon-align';
import { CANON_ORDER_BY_USFM, publicBookId } from './lib/canon';
import type { NormalizedTranslation } from './lib/normalized';
import type { MappingRow } from './lib/versification';
import type { Declarations, TranslationMeta } from './bible.types';

/**
 * Turns a bible-api normalized translation (and its versification declarations)
 * into the rows the database stores. Pure, so the importer, the CLI and the
 * in-memory test Bible share one set of rules (those of bible-api
 * scripts/import.ts).
 */

export interface PreparedVerse {
  chapter: number;
  number: number;
  numberEnd: number | null;
  text: string;
  searchText: string;
}

export interface PreparedBook {
  usfm: string;
  name: string;
  shortName: string;
  abbreviation: string;
  testament: 'OT' | 'NT';
  order: number;
  chapterCount: number;
  verseCount: number;
  chapterVerseCounts: number[];
  verses: PreparedVerse[];
  headers: { chapter: number; beforeVerse: number; title: string }[];
}

export interface PreparedDeclaration {
  usfm: string;
  reviewed: boolean;
  note?: string | null;
  rows: MappingRow[];
}

export interface PreparedTranslation {
  meta: TranslationMeta;
  books: PreparedBook[];
  verseCount: number;
  /** Null when the import has no versification file (a source, or a target to declare later). */
  declarations: PreparedDeclaration[] | null;
  warnings: string[];
}

/** Lower case, no diacritics, single spaces: what search compares against. */
export function searchKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/đ/g, 'dj')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** "*" or "()" stands for a verse the edition omits; it is absent, not text. */
const HAS_TEXT = /\p{L}{2}/u;

export function prepareTranslation(
  raw: NormalizedTranslation,
  meta: TranslationMeta,
  declarations?: Declarations | null,
): PreparedTranslation {
  const warnings: string[] = [];
  if (raw.code !== meta.code) warnings.push(`The file is for '${raw.code}'; imported as '${meta.code}'.`);
  const norm = alignToCanon(structuredClone(raw));
  if (norm.books.length !== 73) warnings.push(`Aligned to ${norm.books.length} of the 73 canon books.`);
  const abbreviations = ABBREVIATIONS[meta.languageCode] ?? {};

  const books: PreparedBook[] = [];
  const seenBooks = new Set<string>();
  let verseCount = 0;
  norm.books.forEach((book, bi) => {
    if (!book.usfm) {
      warnings.push(`'${book.name}' has no book id and was left out.`);
      return;
    }
    const usfm = publicBookId(book.usfm);
    if (seenBooks.has(usfm)) {
      warnings.push(`${usfm} appears twice; the second copy was left out.`);
      return;
    }
    const chapters = book.chapters
      .map((c) => ({ ...c, verses: c.verses.filter((v) => HAS_TEXT.test(v.text)) }))
      .filter((c) => c.verses.length > 0);
    if (chapters.length === 0) return;
    seenBooks.add(usfm);

    const verses: PreparedVerse[] = [];
    const headers: PreparedBook['headers'] = [];
    const counts: number[] = [];
    for (const chapter of chapters) {
      const seen = new Set<number>();
      for (const v of chapter.verses) {
        if (seen.has(v.number)) continue; // duplicate verse in the source: keep the first
        seen.add(v.number);
        const text = v.text.trim();
        verses.push({
          chapter: chapter.number,
          number: v.number,
          numberEnd: v.numberEnd && v.numberEnd > v.number ? v.numberEnd : null,
          text,
          searchText: ` ${searchKey(text)} `,
        });
      }
      counts[chapter.number - 1] = seen.size;
      for (const h of chapter.headers ?? []) {
        headers.push({ chapter: chapter.number, beforeVerse: h.beforeVerse, title: h.title.trim() });
      }
    }
    const bookVerses = verses.length;
    verseCount += bookVerses;
    books.push({
      usfm,
      name: book.name.trim(),
      shortName: (book.shortName || book.name).trim(),
      abbreviation: (abbreviations[usfm] ?? book.abbreviation).trim() || usfm,
      testament: book.testament === 'new' ? 'NT' : 'OT',
      order: CANON_ORDER_BY_USFM.get(book.usfm) ?? bi + 1,
      // The highest chapter, not how many the file has: a file may skip chapters.
      chapterCount: Math.max(0, ...chapters.map((c) => c.number)),
      verseCount: bookVerses,
      chapterVerseCounts: Array.from({ length: Math.max(0, ...chapters.map((c) => c.number)) }, (_, i) => counts[i] ?? 0),
      verses,
      headers,
    });
  });

  return {
    meta,
    books,
    verseCount,
    declarations: declarations ? prepareDeclarations(declarations) : null,
    warnings,
  };
}

/** bible-api versification file -> declared books with their mapping rows. */
export function prepareDeclarations(declarations: Declarations): PreparedDeclaration[] {
  return Object.entries(declarations.books).map(([usfm, decl]) => {
    const rows: MappingRow[] = [];
    for (const ch of decl.unmappable ?? []) {
      rows.push({ srcChapter: ch, srcVerseFrom: null, srcVerseTo: null, dstChapter: ch, offset: 0, unmappable: true });
    }
    for (const r of decl.map ?? []) {
      rows.push({
        srcChapter: r.chapter,
        srcVerseFrom: r.from ?? null,
        srcVerseTo: r.to ?? null,
        dstChapter: r.toChapter ?? r.chapter,
        offset: r.offset ?? 0,
        unmappable: r.unmappable ?? false,
      });
    }
    return { usfm, reviewed: decl.reviewed ?? false, rows };
  });
}
