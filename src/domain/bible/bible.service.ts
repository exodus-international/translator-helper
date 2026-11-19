import { BibleIndex, type IndexTranslation } from './bible.index';
import { resolvePassage, unknownLanguage, validateReference } from './bible.passages';
import { searchKey } from './bible.prepare';
import { bibleStamp, loadChapter, loadHeaders, loadSnapshot, searchVerses } from './bible.repository';
import { DEFAULT_INCLUDE, type Include, type PassageResult, type ReferenceCheck } from './bible.types';

/**
 * The in-app Bible: the resolver and browse functions over Postgres. The index
 * is held per process and rebuilt when the data stamp moves, so an import or a
 * mapping edit on another instance is picked up on the next call.
 */

const STAMP_TTL_MS = 2000;

interface Cached {
  stamp: string;
  checkedAt: number;
  index: BibleIndex;
}

declare global {
  var bibleIndexCache: Cached | undefined;
  var bibleIndexLoading: Promise<Cached> | undefined;
}

export async function getBibleIndex(): Promise<BibleIndex> {
  const cached = globalThis.bibleIndexCache;
  if (cached && Date.now() - cached.checkedAt < STAMP_TTL_MS) return cached.index;
  const stamp = await bibleStamp();
  if (cached && cached.stamp === stamp) {
    cached.checkedAt = Date.now();
    return cached.index;
  }
  if (!globalThis.bibleIndexLoading) {
    globalThis.bibleIndexLoading = (async () => {
      const snapshot = await loadSnapshot();
      const next: Cached = { stamp, checkedAt: Date.now(), index: new BibleIndex(snapshot, loadChapter) };
      globalThis.bibleIndexCache = next;
      return next;
    })().finally(() => {
      globalThis.bibleIndexLoading = undefined;
    });
  }
  return (await globalThis.bibleIndexLoading).index;
}

/** Drops the cached index; the next call reloads it. */
export function invalidateBibleIndex() {
  globalThis.bibleIndexCache = undefined;
}

export async function resolvePassages(
  refs: string[],
  translationKey: string,
  include: Partial<Include> = {},
): Promise<{ translation: string | null; results: PassageResult[] }> {
  const index = await getBibleIndex();
  const target = index.findTranslation(translationKey);
  if (!target) return { translation: null, results: refs.map((r) => unknownLanguage(r, translationKey)) };
  const inc = { ...DEFAULT_INCLUDE, ...include };
  const results: PassageResult[] = [];
  for (const ref of refs) results.push(await resolvePassage(index, ref, target, inc));
  return { translation: target.code, results };
}

export async function validateReferences(refs: string[]): Promise<ReferenceCheck[]> {
  const index = await getBibleIndex();
  const out: ReferenceCheck[] = [];
  for (const ref of refs) out.push(await validateReference(index, ref));
  return out;
}

/** The Bible a language resolves to, or null when none is imported. */
export async function bibleForLanguage(languageCode: string) {
  const index = await getBibleIndex();
  const tr = index.findTranslation(languageCode);
  return tr && tr.language === languageCode.toLowerCase() ? translationDto(index, tr) : null;
}

export function translationDto(index: BibleIndex, t: IndexTranslation) {
  return {
    code: t.code,
    name: t.name,
    language: t.language,
    languageName: t.languageName,
    role: t.role,
    isLanguageDefault: t.isLanguageDefault,
    bookCount: t.bookCount,
    verseCount: t.verseCount,
    importedAt: t.importedAt.toISOString(),
    versification: index.mappingCoverage(t),
  };
}

export type BibleTranslationDto = ReturnType<typeof translationDto>;

export async function listTranslations() {
  const index = await getBibleIndex();
  return index.translations.map((t) => translationDto(index, t));
}

export async function listBooks(translationKey: string) {
  const index = await getBibleIndex();
  const tr = index.findTranslation(translationKey);
  if (!tr) return null;
  return {
    translation: translationDto(index, tr),
    books: index.booksOf(tr).map((b) => {
      const decl = index.declarationOf(tr, b.usfm);
      const sourceChapters = index.sourceVerses.get(b.usfm);
      return {
        id: b.usfm,
        name: b.name,
        shortName: b.shortName,
        abbreviation: b.abbreviation,
        testament: b.testament,
        chapterCount: b.chapterCount,
        verseCount: b.verseCount,
        chapterVerseCounts: b.chapterVerseCounts,
        sourceChapterVerseCounts: sourceChapters
          ? Array.from({ length: Math.max(0, ...sourceChapters.keys()) }, (_, i) => sourceChapters.get(i + 1)?.length ?? 0)
          : [],
        declared: index.isDeclared(tr, b.usfm),
        reviewed: tr.role === 'source' || (decl?.reviewed ?? false),
        unmappableChapters: (decl?.rows ?? []).filter((r) => r.unmappable && r.srcVerseFrom === null).map((r) => r.srcChapter),
        mappedChapters: [
          ...new Set((decl?.rows ?? []).filter((r) => !r.unmappable || r.srcVerseFrom !== null).map((r) => r.srcChapter)),
        ],
      };
    }),
  };
}

export async function getChapter(translationKey: string, usfm: string, chapter: number) {
  const index = await getBibleIndex();
  const tr = index.findTranslation(translationKey);
  if (!tr) return null;
  const books = index.booksOf(tr);
  const i = books.findIndex((b) => b.usfm === usfm.toUpperCase());
  const book = books[i];
  if (!book) return null;
  const [rows, headers] = await Promise.all([loadChapter(book.id, chapter), loadHeaders(book.id, chapter)]);
  if (rows.length === 0) return null;
  const prevBook = books[i - 1];
  const nextBook = books[i + 1];
  return {
    translation: tr.code,
    language: tr.language,
    book: { id: book.usfm, name: book.name, abbreviation: book.abbreviation, chapterCount: book.chapterCount },
    chapter,
    verses: rows.map((v) => ({
      id: `${book.usfm}.${chapter}.${v.verse}${v.verse_end ? `-${v.verse_end}` : ''}`,
      verse: v.verse,
      ...(v.verse_end && { verse_end: v.verse_end }),
      text: v.text,
    })),
    headers,
    prev:
      chapter > 1
        ? { book: book.usfm, chapter: chapter - 1 }
        : prevBook
          ? { book: prevBook.usfm, chapter: prevBook.chapterCount }
          : null,
    next:
      chapter < book.chapterCount
        ? { book: book.usfm, chapter: chapter + 1 }
        : nextBook
          ? { book: nextBook.usfm, chapter: 1 }
          : null,
  };
}

export type ChapterDto = NonNullable<Awaited<ReturnType<typeof getChapter>>>;

/** Every word is a prefix match; diacritics are ignored. Null when the query has no searchable words. */
export async function searchBible(translationKey: string, q: string, options: { book?: string; limit?: number } = {}) {
  const index = await getBibleIndex();
  const tr = index.findTranslation(translationKey);
  if (!tr) return null;
  const words = searchKey(q).split(' ').filter(Boolean).slice(0, 8);
  if (words.join('').length < 2) return { translation: tr.code, results: [] };
  const book = options.book ? index.findBook(tr, options.book.toUpperCase()) : undefined;
  if (options.book && !book) return { translation: tr.code, results: [] };
  const rows = await searchVerses(tr.id, words, options.limit ?? 20, book?.id);
  const abbreviations = new Map(index.booksOf(tr).map((b) => [b.usfm, b.abbreviation]));
  return {
    translation: tr.code,
    results: rows.map((r) => ({
      id: `${r.book.usfm}.${r.chapter}.${r.number}`,
      book: r.book.usfm,
      abbreviation: abbreviations.get(r.book.usfm) ?? r.book.usfm,
      chapter: r.chapter,
      verse: r.number,
      ...(r.numberEnd && { verse_end: r.numberEnd }),
      text: r.text,
    })),
  };
}
