import prisma from '@/lib/db';
import { sourceVerseIndex, type DeclaredBook, type IndexBook, type IndexSnapshot, type VerseRow } from './bible.index';
import type { PreparedDeclaration, PreparedTranslation } from './bible.prepare';
import type { MappingInput } from './bible.types';

/** Database access for the Bible module. Callers authorize; this file does not. */

const VERSE_CHUNK = 2000;
/** A full Bible is ~35k verses; the import runs in one transaction. */
const IMPORT_TIMEOUT_MS = 10 * 60 * 1000;
// Any constant both writers agree on; it names the lock, nothing else.
const TRANSLATIONS_LOCK = 724_190_001;

export class BibleImportError extends Error {}

/** Moves whenever an import, delete, default change or mapping edit lands. */
export async function bibleStamp(): Promise<string> {
  const agg = await prisma.bibleTranslation.aggregate({ _max: { updatedAt: true }, _count: { _all: true } });
  return `${agg._count._all}:${agg._max.updatedAt?.getTime() ?? 0}`;
}

export async function loadSnapshot(): Promise<IndexSnapshot> {
  const translations = await prisma.bibleTranslation.findMany({ orderBy: { code: 'asc' } });
  const books = await prisma.bibleBook.findMany({
    select: {
      id: true,
      translationId: true,
      usfm: true,
      name: true,
      shortName: true,
      abbreviation: true,
      testament: true,
      order: true,
      chapterCount: true,
      verseCount: true,
      chapterVerseCounts: true,
    },
    orderBy: [{ translationId: 'asc' }, { order: 'asc' }],
  });
  const declaredBooks = await prisma.bibleVersificationBook.findMany({
    include: { mappings: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] } },
  });

  const booksByTranslation = new Map<string, IndexBook[]>();
  for (const b of books) {
    const list = booksByTranslation.get(b.translationId) ?? [];
    list.push({ ...b, testament: b.testament === 'NT' ? 'NT' : 'OT' });
    booksByTranslation.set(b.translationId, list);
  }
  const declared = new Map<string, Map<string, DeclaredBook>>();
  for (const d of declaredBooks) {
    const map = declared.get(d.translationId) ?? new Map<string, DeclaredBook>();
    map.set(d.usfm, {
      reviewed: d.reviewed,
      note: d.note,
      rows: d.mappings.map((m) => ({
        srcChapter: m.srcChapter,
        srcVerseFrom: m.srcVerseFrom,
        srcVerseTo: m.srcVerseTo,
        dstChapter: m.dstChapter,
        offset: m.offset,
        unmappable: m.unmappable,
      })),
    });
    declared.set(d.translationId, map);
  }

  const source = translations.find((t) => t.role === 'SOURCE');
  const sourceRows = source
    ? await prisma.bibleVerse.findMany({
        where: { book: { translationId: source.id } },
        select: { chapter: true, number: true, numberEnd: true, book: { select: { usfm: true } } },
      })
    : [];

  return {
    translations: translations.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      language: t.languageCode,
      languageName: t.languageName,
      role: t.role === 'SOURCE' ? 'source' : 'target',
      isLanguageDefault: t.isLanguageDefault,
      bookCount: t.bookCount,
      verseCount: t.verseCount,
      importedAt: t.importedAt,
    })),
    books: booksByTranslation,
    declared,
    sourceVerses: sourceVerseIndex(
      sourceRows.map((r) => ({ usfm: r.book.usfm, chapter: r.chapter, number: r.number, numberEnd: r.numberEnd })),
    ),
  };
}

export async function loadChapter(bookId: string, chapter: number): Promise<VerseRow[]> {
  const rows = await prisma.bibleVerse.findMany({
    where: { bookId, chapter },
    select: { number: true, numberEnd: true, text: true },
    orderBy: { number: 'asc' },
  });
  return rows.map((r) => ({ verse: r.number, verse_end: r.numberEnd, text: r.text }));
}

export async function loadHeaders(bookId: string, chapter: number) {
  return prisma.bibleSectionHeader.findMany({
    where: { bookId, chapter },
    select: { beforeVerse: true, title: true },
    orderBy: [{ beforeVerse: 'asc' }, { id: 'asc' }],
  });
}

/** Every word must start a word of the verse; diacritics and case are ignored. */
export async function searchVerses(translationId: string, words: string[], limit: number, bookId?: string) {
  return prisma.bibleVerse.findMany({
    where: {
      book: { translationId },
      ...(bookId && { bookId }),
      AND: words.map((w) => ({ searchText: { contains: ` ${w}` } })),
    },
    select: { chapter: true, number: true, numberEnd: true, text: true, book: { select: { usfm: true, order: true } } },
    orderBy: [{ book: { order: 'asc' } }, { chapter: 'asc' }, { number: 'asc' }],
    take: limit,
  });
}

// ---------------------------------------------------------------------------
// Writes

/**
 * Replaces the translation with this code, or creates it, in one transaction.
 * The first translation of a language becomes its default; a replaced
 * translation keeps its default flag. Only one translation may be the source.
 */
export async function writeTranslation(prepared: PreparedTranslation, importedById: string | null) {
  const { meta } = prepared;
  return prisma.$transaction(
    async (tx) => {
      await lockTranslations(tx);
      const existing = await tx.bibleTranslation.findUnique({ where: { code: meta.code } });
      if (meta.role === 'source') {
        const other = await tx.bibleTranslation.findFirst({ where: { role: 'SOURCE', NOT: { code: meta.code } } });
        if (other) throw new BibleImportError(`'${other.code}' is already the source translation; delete it first.`);
      }
      const otherDefault = await tx.bibleTranslation.findFirst({
        where: { languageCode: meta.languageCode, isLanguageDefault: true, NOT: { code: meta.code } },
        select: { id: true },
      });
      // Declarations survive a text-only re-import.
      const keptDeclarations =
        existing && prepared.declarations === null ? await readDeclarations(tx, existing.id) : null;
      if (existing) await tx.bibleTranslation.delete({ where: { id: existing.id } });

      const translation = await tx.bibleTranslation.create({
        data: {
          code: meta.code,
          name: meta.name,
          languageCode: meta.languageCode,
          languageName: meta.languageName,
          role: meta.role === 'source' ? 'SOURCE' : 'TARGET',
          isLanguageDefault: existing ? existing.isLanguageDefault && !otherDefault : !otherDefault,
          bookCount: prepared.books.length,
          verseCount: prepared.verseCount,
          importedById,
        },
      });

      await tx.bibleBook.createMany({
        data: prepared.books.map((b) => ({
          translationId: translation.id,
          usfm: b.usfm,
          name: b.name,
          shortName: b.shortName,
          abbreviation: b.abbreviation,
          testament: b.testament,
          order: b.order,
          chapterCount: b.chapterCount,
          verseCount: b.verseCount,
          chapterVerseCounts: b.chapterVerseCounts,
        })),
      });
      const bookIds = new Map(
        (await tx.bibleBook.findMany({ where: { translationId: translation.id }, select: { id: true, usfm: true } })).map(
          (b) => [b.usfm, b.id],
        ),
      );

      const verses = prepared.books.flatMap((b) => b.verses.map((v) => ({ bookId: bookIds.get(b.usfm)!, ...v })));
      for (let i = 0; i < verses.length; i += VERSE_CHUNK) {
        await tx.bibleVerse.createMany({ data: verses.slice(i, i + VERSE_CHUNK) });
      }
      const headers = prepared.books.flatMap((b) => b.headers.map((h) => ({ bookId: bookIds.get(b.usfm)!, ...h })));
      for (let i = 0; i < headers.length; i += VERSE_CHUNK) {
        await tx.bibleSectionHeader.createMany({ data: headers.slice(i, i + VERSE_CHUNK) });
      }

      const declarations = (prepared.declarations ?? keptDeclarations ?? []).filter((d) => bookIds.has(d.usfm));
      if (meta.role === 'target') await insertDeclarations(tx, translation.id, declarations);

      return {
        code: translation.code,
        books: prepared.books.length,
        verses: verses.length,
        declaredBooks: meta.role === 'target' ? declarations.length : prepared.books.length,
        replaced: Boolean(existing),
      };
    },
    { timeout: IMPORT_TIMEOUT_MS, maxWait: 30_000 },
  );
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Holds until the transaction ends, so imports and default changes run one at
 * a time: "one source" and "one default per language" are checked by reading
 * first, which two writers at once would both pass.
 */
async function lockTranslations(tx: Tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${TRANSLATIONS_LOCK})`;
}

async function readDeclarations(tx: Tx, translationId: string): Promise<PreparedDeclaration[]> {
  const books = await tx.bibleVersificationBook.findMany({
    where: { translationId },
    include: { mappings: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] } },
  });
  return books.map((b) => ({
    usfm: b.usfm,
    reviewed: b.reviewed,
    note: b.note,
    rows: b.mappings.map(({ srcChapter, srcVerseFrom, srcVerseTo, dstChapter, offset, unmappable }) => ({
      srcChapter,
      srcVerseFrom,
      srcVerseTo,
      dstChapter,
      offset,
      unmappable,
    })),
  }));
}

async function insertDeclarations(
  tx: Tx,
  translationId: string,
  declarations: (PreparedDeclaration & { note?: string | null })[],
) {
  for (const d of declarations) {
    await tx.bibleVersificationBook.create({
      data: {
        translationId,
        usfm: d.usfm,
        reviewed: d.reviewed,
        note: d.note ?? null,
        mappings: { create: d.rows.map((r, position) => ({ ...r, position })) },
      },
    });
  }
}

/** Replaces a target's whole versification with a declarations file. */
export async function replaceDeclarations(code: string, declarations: PreparedDeclaration[]) {
  return prisma.$transaction(
    async (tx) => {
      const translation = await tx.bibleTranslation.findUnique({ where: { code } });
      if (!translation) throw new BibleImportError(`No translation '${code}'.`);
      if (translation.role === 'SOURCE') throw new BibleImportError('The source translation has no versification to declare.');
      const usfms = new Set(
        (await tx.bibleBook.findMany({ where: { translationId: translation.id }, select: { usfm: true } })).map((b) => b.usfm),
      );
      const unknown = declarations.filter((d) => !usfms.has(d.usfm)).map((d) => d.usfm);
      await tx.bibleVersificationBook.deleteMany({ where: { translationId: translation.id } });
      const kept = declarations.filter((d) => usfms.has(d.usfm));
      await insertDeclarations(tx, translation.id, kept);
      await touch(tx, translation.id);
      return { code, declaredBooks: kept.length, skipped: unknown };
    },
    { timeout: 60_000 },
  );
}

async function touch(tx: Tx, translationId: string) {
  await tx.bibleTranslation.update({ where: { id: translationId }, data: { updatedAt: new Date() } });
}

export async function deleteTranslation(code: string) {
  return prisma.bibleTranslation.delete({ where: { code }, select: { code: true } });
}

/** Makes this translation the one its language resolves to. */
export async function setLanguageDefault(code: string) {
  return prisma.$transaction(async (tx) => {
    await lockTranslations(tx);
    const t = await tx.bibleTranslation.findUniqueOrThrow({ where: { code } });
    await tx.bibleTranslation.updateMany({
      where: { languageCode: t.languageCode, NOT: { id: t.id } },
      data: { isLanguageDefault: false },
    });
    await tx.bibleTranslation.update({ where: { id: t.id }, data: { isLanguageDefault: true } });
    return { code };
  });
}

async function targetOrThrow(tx: Tx, code: string) {
  const t = await tx.bibleTranslation.findUnique({ where: { code } });
  if (!t) throw new BibleImportError(`No translation '${code}'.`);
  if (t.role === 'SOURCE') throw new BibleImportError('The source translation has no versification.');
  return t;
}

/** Declares a book (identity unless rows say otherwise), or takes the declaration back. */
export async function setBookDeclaration(
  code: string,
  usfm: string,
  declared: boolean,
  reviewed?: boolean,
  note?: string | null,
) {
  return prisma.$transaction(async (tx) => {
    const t = await targetOrThrow(tx, code);
    const book = await tx.bibleBook.findUnique({ where: { translationId_usfm: { translationId: t.id, usfm } } });
    if (!book) throw new BibleImportError(`${code} does not contain ${usfm}.`);
    if (!declared) {
      await tx.bibleVersificationBook.deleteMany({ where: { translationId: t.id, usfm } });
    } else {
      await tx.bibleVersificationBook.upsert({
        where: { translationId_usfm: { translationId: t.id, usfm } },
        create: { translationId: t.id, usfm, reviewed: reviewed ?? false, note: note ?? null },
        update: { ...(reviewed !== undefined && { reviewed }), ...(note !== undefined && { note }) },
      });
    }
    await touch(tx, t.id);
    return { code, usfm, declared };
  });
}

export async function addMapping(input: MappingInput) {
  return prisma.$transaction(async (tx) => {
    const t = await targetOrThrow(tx, input.code);
    const decl = await tx.bibleVersificationBook.findUnique({
      where: { translationId_usfm: { translationId: t.id, usfm: input.usfm } },
      include: { mappings: { select: { position: true }, orderBy: { position: 'desc' }, take: 1 } },
    });
    if (!decl) throw new BibleImportError(`Declare ${input.usfm} before adding mappings.`);
    const row = await tx.bibleVerseMapping.create({
      data: {
        bookId: decl.id,
        srcChapter: input.srcChapter,
        srcVerseFrom: input.srcVerseFrom,
        srcVerseTo: input.srcVerseFrom === null ? null : input.srcVerseTo,
        dstChapter: input.dstChapter,
        offset: input.unmappable ? 0 : input.offset,
        unmappable: input.unmappable,
        position: (decl.mappings[0]?.position ?? -1) + 1,
      },
      select: { id: true },
    });
    await touch(tx, t.id);
    return row;
  });
}

export async function deleteMapping(code: string, mappingId: string) {
  return prisma.$transaction(async (tx) => {
    const t = await targetOrThrow(tx, code);
    const { count } = await tx.bibleVerseMapping.deleteMany({ where: { id: mappingId, book: { translationId: t.id } } });
    if (count === 0) throw new BibleImportError('That mapping no longer exists.');
    await touch(tx, t.id);
    return { id: mappingId };
  });
}

/** Mapping rows with their ids, for the versification editor. */
export async function listMappings(code: string, usfm: string) {
  const decl = await prisma.bibleVersificationBook.findFirst({
    where: { usfm, translation: { code } },
    include: { mappings: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] } },
  });
  return decl
    ? {
        reviewed: decl.reviewed,
        note: decl.note,
        rows: decl.mappings.map((m) => ({
          id: m.id,
          srcChapter: m.srcChapter,
          srcVerseFrom: m.srcVerseFrom,
          srcVerseTo: m.srcVerseTo,
          dstChapter: m.dstChapter,
          offset: m.offset,
          unmappable: m.unmappable,
        })),
      }
    : null;
}

export async function translationImporters() {
  return prisma.bibleTranslation.findMany({
    select: { code: true, importedBy: { select: { name: true, email: true } } },
  });
}
