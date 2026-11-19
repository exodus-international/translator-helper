import { COMMON_ALIASES } from './lib/aliases';
import { publicBookId } from './lib/canon';
import { normalizeBook } from './lib/reference';
import type { MappingRow } from './lib/versification';

/**
 * Everything the resolver needs that is small enough to hold in memory: the
 * translations, their books, the declared versification and the verse numbers
 * of the source. Verse text is loaded per chapter through `loadChapter`.
 * Port of bible-api src/api/store.ts.
 */

export interface IndexTranslation {
  id: string;
  code: string;
  name: string;
  language: string;
  languageName: string;
  role: 'source' | 'target';
  isLanguageDefault: boolean;
  bookCount: number;
  verseCount: number;
  importedAt: Date;
}

export interface IndexBook {
  id: string;
  usfm: string;
  name: string;
  shortName: string;
  abbreviation: string;
  testament: 'OT' | 'NT';
  order: number;
  chapterCount: number;
  verseCount: number;
  chapterVerseCounts: number[];
}

export interface DeclaredBook {
  reviewed: boolean;
  note: string | null;
  rows: MappingRow[];
}

export interface VerseRow {
  verse: number;
  verse_end: number | null;
  text: string;
}

export interface IndexSnapshot {
  translations: IndexTranslation[];
  books: Map<string, IndexBook[]>; // translation id -> books in canon order
  declared: Map<string, Map<string, DeclaredBook>>; // translation id -> usfm -> declaration
  /** usfm -> chapter -> verse numbers of the source, merged verses expanded. */
  sourceVerses: Map<string, Map<number, number[]>>;
}

export type ChapterLoader = (bookId: string, chapter: number) => Promise<VerseRow[]>;

export class BibleIndex {
  readonly translations: IndexTranslation[];
  readonly source: IndexTranslation | undefined;
  readonly sourceVerses: Map<string, Map<number, number[]>>;
  private readonly books: Map<string, IndexBook[]>;
  private readonly declared: Map<string, Map<string, DeclaredBook>>;
  private readonly global = new Map<string, string>();
  private readonly own = new Map<string, Map<string, string>>();
  private readonly unambiguous = new Map<string, string>();

  constructor(
    snapshot: IndexSnapshot,
    private readonly loadChapter: ChapterLoader,
  ) {
    this.translations = [...snapshot.translations].sort(
      (a, b) => (a.role === b.role ? a.code.localeCompare(b.code) : a.role === 'source' ? -1 : 1),
    );
    this.source = this.translations.find((t) => t.role === 'source');
    this.books = snapshot.books;
    this.declared = snapshot.declared;
    this.sourceVerses = snapshot.sourceVerses;
    this.buildAliases();
  }

  /** By translation code, or by language (its default translation, else its only one). */
  findTranslation(key: string): IndexTranslation | undefined {
    const k = key.trim().toLowerCase();
    const byCode = this.translations.find((t) => t.code === k);
    if (byCode) return byCode;
    const ofLanguage = this.translations.filter((t) => t.language === k);
    return ofLanguage.find((t) => t.isLanguageDefault) ?? (ofLanguage.length === 1 ? ofLanguage[0] : undefined);
  }

  booksOf(tr: IndexTranslation): IndexBook[] {
    return this.books.get(tr.id) ?? [];
  }

  findBook(tr: IndexTranslation, usfm: string): IndexBook | undefined {
    return this.booksOf(tr).find((b) => b.usfm === usfm);
  }

  isDeclared(tr: IndexTranslation, usfm: string): boolean {
    return tr.role === 'source' || (this.declared.get(tr.id)?.has(usfm) ?? false);
  }

  // Read by bible.service through the index instance, which the dead-code check cannot follow.
  // fallow-ignore-next-line unused-class-member
  declarationOf(tr: IndexTranslation, usfm: string): DeclaredBook | undefined {
    return this.declared.get(tr.id)?.get(usfm);
  }

  mappingRows(tr: IndexTranslation, usfm: string): MappingRow[] {
    return this.declared.get(tr.id)?.get(usfm)?.rows ?? [];
  }

  mappingCoverage(tr: IndexTranslation) {
    const present = this.booksOf(tr).length;
    if (tr.role === 'source') {
      return { declaredBooks: present, presentBooks: present, reviewedBooks: present, unmappableChapters: 0 };
    }
    const declared = this.declared.get(tr.id) ?? new Map<string, DeclaredBook>();
    let unmappable = 0;
    let reviewed = 0;
    for (const d of declared.values()) {
      unmappable += d.rows.filter((r) => r.unmappable && r.srcVerseFrom === null).length;
      if (d.reviewed) reviewed++;
    }
    return { declaredBooks: declared.size, presentBooks: present, reviewedBooks: reviewed, unmappableChapters: unmappable };
  }

  // -------------------------------------------------------------------------
  // Book aliases. References are written in English (RSV-CE convention), so the
  // global set is USFM ids, the common English/USCCB/Croatian aliases and the
  // source's own names. A target's own names are accepted too ("Iv 3,16" for
  // hr), and another language's name only when it means one book in every
  // language. Exact matches only: an unknown alias is unknown_book, never a guess.

  resolveBook(raw: string, tr: IndexTranslation): string | null {
    const k = normalizeBook(raw);
    if (!k) return null;
    return this.global.get(k) ?? this.own.get(tr.id)?.get(k) ?? this.unambiguous.get(k) ?? null;
  }

  async chapterText(bookId: string, chapter: number): Promise<Map<number, VerseRow>> {
    const out = new Map<number, VerseRow>();
    for (const row of await this.loadChapter(bookId, chapter)) {
      for (let v = row.verse; v <= (row.verse_end ?? row.verse); v++) out.set(v, row);
    }
    return out;
  }

  private namesOf(tr: IndexTranslation): Map<string, string> {
    const map = new Map<string, string>();
    for (const b of this.booksOf(tr)) {
      for (const name of [b.abbreviation, b.shortName, b.name]) {
        const k = normalizeBook(name);
        if (k && !map.has(k)) map.set(k, b.usfm);
      }
    }
    return map;
  }

  private buildAliases() {
    if (this.source) {
      for (const b of this.booksOf(this.source)) this.global.set(b.usfm.toLowerCase(), b.usfm);
    }
    for (const [k, usfm] of Object.entries(COMMON_ALIASES)) if (!this.global.has(k)) this.global.set(k, publicBookId(usfm));
    if (this.source) {
      for (const [k, usfm] of this.namesOf(this.source)) if (!this.global.has(k)) this.global.set(k, usfm);
    }
    const conflicting = new Set<string>();
    for (const t of this.translations) {
      const names = this.namesOf(t);
      this.own.set(t.id, names);
      for (const [k, usfm] of names) {
        if (this.unambiguous.has(k) && this.unambiguous.get(k) !== usfm) conflicting.add(k);
        this.unambiguous.set(k, usfm);
      }
    }
    for (const k of conflicting) this.unambiguous.delete(k);
  }
}

/** Source verse numbers from (book, chapter, number, numberEnd) rows. */
export function sourceVerseIndex(
  rows: Iterable<{ usfm: string; chapter: number; number: number; numberEnd: number | null }>,
): Map<string, Map<number, number[]>> {
  const out = new Map<string, Map<number, number[]>>();
  for (const r of rows) {
    const chapters = out.get(r.usfm) ?? new Map<number, number[]>();
    out.set(r.usfm, chapters);
    const verses = chapters.get(r.chapter) ?? [];
    chapters.set(r.chapter, verses);
    for (let v = r.number; v <= (r.numberEnd ?? r.number); v++) verses.push(v);
  }
  for (const chapters of out.values()) for (const verses of chapters.values()) verses.sort((a, b) => a - b);
  return out;
}
