import { BibleIndex, type IndexTranslation } from './bible.index';
import { resolvePassage, unknownLanguage, validateReference, VerseBudget } from './bible.passages';
import { searchKey } from './bible.prepare';
import { bibleStamp, loadChapter, loadHeaders, loadSnapshot, searchVerses } from './bible.repository';
import { DEFAULT_INCLUDE, type Include, type PassageResult, type ReferenceCheck } from './bible.types';

/**
 * The in-app Bible: the resolver and browse functions over Postgres. The index
 * is held per process and rebuilt when the data stamp moves, so an import or a
 * mapping edit on another instance is picked up on the next call.
 */

const STAMP_TTL_MS = 2000;
/** Verses one request from a browser may read across all its references. */
export const MAX_VERSES_PER_REQUEST = 2000;

interface Cached {
  stamp: string;
  checkedAt: number;
  index: BibleIndex;
}

declare global {
  var bibleIndexCache: Cached | undefined;
  var bibleIndexLoading: { generation: number; promise: Promise<Cached> } | undefined;
  /** Bumped by every invalidation, so a load started before one cannot be kept after it. */
  var bibleIndexGeneration: number | undefined;
}

export async function getBibleIndex(): Promise<BibleIndex> {
  const cached = globalThis.bibleIndexCache;
  if (cached && Date.now() - cached.checkedAt < STAMP_TTL_MS) return cached.index;
  const generation = globalThis.bibleIndexGeneration ?? 0;
  const stamp = await bibleStamp();
  if (cached && cached.stamp === stamp && globalThis.bibleIndexCache === cached) {
    cached.checkedAt = Date.now();
    return cached.index;
  }
  let loading = globalThis.bibleIndexLoading;
  if (!loading || loading.generation !== generation) {
    const promise = (async () => {
      const snapshot = await loadSnapshot();
      const next: Cached = { stamp, checkedAt: Date.now(), index: new BibleIndex(snapshot, loadChapter) };
      if ((globalThis.bibleIndexGeneration ?? 0) === generation) globalThis.bibleIndexCache = next;
      return next;
    })().finally(() => {
      if (globalThis.bibleIndexLoading?.promise === promise) globalThis.bibleIndexLoading = undefined;
    });
    loading = { generation, promise };
    globalThis.bibleIndexLoading = loading;
  }
  return (await loading.promise).index;
}

/**
 * Drops the cached index and any load already under way; the next call reads
 * the data afresh. A load that began before the change is still returned to
 * whoever awaits it, but is never kept.
 */
export function invalidateBibleIndex() {
  globalThis.bibleIndexGeneration = (globalThis.bibleIndexGeneration ?? 0) + 1;
  globalThis.bibleIndexCache = undefined;
  globalThis.bibleIndexLoading = undefined;
}

/**
 * References one call has no verses left for come back in `deferred`, not as
 * a miss: they are as valid as the rest, and the caller sends them again. The
 * first reference always fits (one is capped well under the budget), so asking
 * again always gets further.
 */
async function withinBudget<T>(
  refs: string[],
  maxVerses: number | undefined,
  run: (ref: string, budget: VerseBudget | undefined) => Promise<T>,
): Promise<{ results: T[]; deferred: string[] }> {
  const budget = maxVerses === undefined ? undefined : new VerseBudget(maxVerses);
  const results: T[] = [];
  for (let i = 0; i < refs.length; i++) {
    const result = await run(refs[i]!, budget);
    if (budget?.refused) return { results, deferred: refs.slice(i) };
    results.push(result);
  }
  return { results, deferred: [] };
}

/**
 * Passages in a translation (or a language's Bible). `maxVerses` caps what the
 * whole call reads, for requests a browser makes; the server's own callers
 * read every reference, each still capped on its own.
 */
export async function resolvePassages(
  refs: string[],
  translationKey: string,
  include: Partial<Include> = {},
  { maxVerses }: { maxVerses?: number } = {},
): Promise<{ translation: string | null; results: PassageResult[]; deferred: string[] }> {
  const index = await getBibleIndex();
  const target = index.findTranslation(translationKey);
  if (!target) {
    return { translation: null, results: refs.map((r) => unknownLanguage(r, translationKey)), deferred: [] };
  }
  const inc = { ...DEFAULT_INCLUDE, ...include };
  const { results, deferred } = await withinBudget(refs, maxVerses, (ref, budget) =>
    resolvePassage(index, ref, target, inc, budget),
  );
  return { translation: target.code, results, deferred };
}

export async function validateReferences(
  refs: string[],
  { maxVerses }: { maxVerses?: number } = {},
): Promise<{ results: ReferenceCheck[]; deferred: string[] }> {
  const index = await getBibleIndex();
  return withinBudget(refs, maxVerses, (ref, budget) => validateReference(index, ref, budget));
}

/** Words of a sentence a text search takes, then fewer when that finds nothing. */
const ANCHOR_WORDS = [8, 5];
/** A sentence shorter than this says too little to be found by. */
const MIN_ANCHOR_WORDS = 4;
/** How many chapters a reading found by its text may cross. */
const MAX_READING_CHAPTERS = 3;

/**
 * The RSV-CE passage a reading is, found by its text: from the verse its first
 * sentence opens to the verse its last sentence closes. It is a guess for the
 * caller to compare with the passage's text. Null when either end is not found.
 */
export async function identifyPassage(text: string): Promise<string | null> {
  const index = await getBibleIndex();
  const source = index.source;
  if (!source) return null;
  const sentences = text
    .split(/(?<=[.?!;])\s+/)
    .map((s) => searchKey(s).split(' ').filter(Boolean))
    .filter((words) => words.length >= MIN_ANCHOR_WORDS);
  if (sentences.length === 0) return null;

  const find = async (words: string[], from: 'start' | 'end') => {
    for (const count of ANCHOR_WORDS) {
      const anchor = from === 'start' ? words.slice(0, count) : words.slice(-count);
      const rows = await searchVerses(source.id, anchor, 10);
      if (rows.length) return rows;
    }
    return [];
  };
  const starts = await find(sentences[0], 'start');
  const ends = sentences.length > 1 ? await find(sentences.at(-1)!, 'end') : starts;

  let best: { start: (typeof starts)[number]; end: (typeof ends)[number]; span: number } | null = null;
  for (const start of starts) {
    for (const end of ends) {
      if (end.book.usfm !== start.book.usfm) continue;
      const chapters = end.chapter - start.chapter;
      const span = chapters * 1000 + (end.numberEnd ?? end.number) - start.number;
      if (chapters < 0 || chapters > MAX_READING_CHAPTERS || span < 0) continue;
      if (!best || span < best.span) best = { start, end, span };
    }
  }
  if (!best) return null;
  const { start, end } = best;
  const book = index.findBook(source, start.book.usfm)?.shortName ?? start.book.usfm;
  const last = end.numberEnd ?? end.number;
  if (end.chapter !== start.chapter) return `${book} ${start.chapter}:${start.number}-${end.chapter}:${last}`;
  return `${book} ${start.chapter}:${start.number}${last > start.number ? `-${last}` : ''}`;
}

/** The Bible a language resolves to, or null when none is imported. */
export async function bibleForLanguage(languageCode: string) {
  const index = await getBibleIndex();
  const tr = index.findTranslation(languageCode);
  return tr && tr.language === languageCode.toLowerCase() ? translationDto(index, tr) : null;
}

function translationDto(index: BibleIndex, t: IndexTranslation) {
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
