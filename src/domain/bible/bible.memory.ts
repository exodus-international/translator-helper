import { BibleIndex, sourceVerseIndex, type DeclaredBook, type IndexBook, type IndexTranslation, type VerseRow } from './bible.index';
import type { PreparedTranslation } from './bible.prepare';

/**
 * A Bible held entirely in memory, built from prepared translations. Used by
 * tests and by the import CLI's dry run; the app reads Postgres instead.
 */
export function memoryBible(prepared: PreparedTranslation[]): BibleIndex {
  const translations: IndexTranslation[] = [];
  const books = new Map<string, IndexBook[]>();
  const declared = new Map<string, Map<string, DeclaredBook>>();
  const chapters = new Map<string, VerseRow[]>(); // `${bookId}:${chapter}`
  const seenLanguages = new Set<string>();
  let sourceRows: Parameters<typeof sourceVerseIndex>[0] = [];

  for (const p of prepared) {
    const id = p.meta.code;
    translations.push({
      id,
      code: p.meta.code,
      name: p.meta.name,
      language: p.meta.languageCode,
      languageName: p.meta.languageName,
      role: p.meta.role,
      isLanguageDefault: !seenLanguages.has(p.meta.languageCode),
      bookCount: p.books.length,
      verseCount: p.verseCount,
      importedAt: new Date(0),
    });
    seenLanguages.add(p.meta.languageCode);
    books.set(
      id,
      p.books
        .map((b) => ({ ...b, id: `${id}:${b.usfm}` }))
        .sort((a, b) => a.order - b.order),
    );
    declared.set(
      id,
      new Map((p.declarations ?? []).map((d) => [d.usfm, { reviewed: d.reviewed, note: null, rows: d.rows }])),
    );
    for (const b of p.books) {
      for (const v of b.verses) {
        const key = `${id}:${b.usfm}:${v.chapter}`;
        const list = chapters.get(key) ?? [];
        list.push({ verse: v.number, verse_end: v.numberEnd, text: v.text });
        chapters.set(key, list);
      }
    }
    if (p.meta.role === 'source') {
      sourceRows = p.books.flatMap((b) => b.verses.map((v) => ({ usfm: b.usfm, chapter: v.chapter, number: v.number, numberEnd: v.numberEnd })));
    }
  }

  return new BibleIndex(
    { translations, books, declared, sourceVerses: sourceVerseIndex(sourceRows) },
    async (bookId, chapter) => [...(chapters.get(`${bookId}:${chapter}`) ?? [])].sort((a, b) => a.verse - b.verse),
  );
}
