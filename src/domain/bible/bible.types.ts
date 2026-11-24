import { z } from 'zod';

/**
 * Shapes shared by the Bible module: the bible-api import files, the resolver's
 * results and the inputs of the Bible actions.
 */

// ---------------------------------------------------------------------------
// Import files

const verseSchema = z.object({
  number: z.number().int().min(0).max(1000),
  numberEnd: z.number().int().min(0).max(1000).optional(),
  text: z.string().max(10_000),
});

const chapterSchema = z.object({
  number: z.number().int().min(1).max(200),
  verses: z.array(verseSchema).max(1000),
  headers: z
    .array(z.object({ beforeVerse: z.number().int().min(0).max(1000), title: z.string().max(500) }))
    .max(200)
    .optional(),
});

const bookSchema = z.object({
  usfm: z
    .string()
    .regex(/^[0-9A-Z]{3}$/)
    .nullable(),
  name: z.string().min(1).max(200),
  shortName: z.string().max(200),
  abbreviation: z.string().max(50),
  slug: z.string().max(50),
  testament: z.enum(['old', 'new']),
  chapters: z.array(chapterSchema).max(200),
});

export const TRANSLATION_CODE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const LANGUAGE_CODE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/;

/** bible-api `data/normalized/<code>.json`. */
export const normalizedTranslationSchema = z.object({
  code: z.string().min(2).max(40).regex(TRANSLATION_CODE),
  books: z.array(bookSchema).min(1).max(120),
});

const mapRowSchema = z.object({
  chapter: z.number().int().min(1).max(200),
  from: z.number().int().min(0).max(1000).optional(),
  to: z.number().int().min(0).max(1000).optional(),
  toChapter: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(-1000).max(1000).optional(),
  unmappable: z.boolean().optional(),
});

/** bible-api `data/versification/<code>.json`. */
export const declarationsSchema = z.object({
  translation: z.string().min(2).max(40).regex(TRANSLATION_CODE),
  source: z.string().max(40).optional(),
  books: z.record(
    z.string().regex(/^[0-9A-Z]{3}$/),
    z.object({
      reviewed: z.boolean().optional(),
      unmappable: z.array(z.number().int().min(1).max(200)).max(200).optional(),
      gaps: z.array(z.number().int().min(1).max(200)).max(200).optional(),
      shifted: z.array(z.number().int().min(1).max(200)).max(200).optional(),
      map: z.array(mapRowSchema).max(500).optional(),
    }),
  ),
  undeclared: z.record(z.string(), z.string().max(2000)).optional(),
});

export type Declarations = z.infer<typeof declarationsSchema>;

/** Who the imported translation is; the defaults for the seven bible-api translations live in lib/translations. */
export const translationMetaSchema = z.object({
  code: z.string().min(2).max(40).regex(TRANSLATION_CODE),
  name: z.string().trim().min(1).max(200),
  languageCode: z.string().trim().toLowerCase().regex(LANGUAGE_CODE),
  languageName: z.string().trim().min(1).max(100),
  role: z.enum(['source', 'target']),
});

export type TranslationMeta = z.infer<typeof translationMetaSchema>;

// ---------------------------------------------------------------------------
// Resolver

export type PassageStatus =
  | 'ok'
  | 'partial'
  | 'unparseable'
  | 'unknown_book'
  | 'unknown_language'
  | 'book_not_in_translation'
  | 'versification_unmapped'
  | 'out_of_range';

export interface Include {
  text: boolean;
  verses: boolean;
  rendered: boolean;
  source: boolean;
}

export const DEFAULT_INCLUDE: Include = { text: true, verses: true, rendered: true, source: false };

export interface VerseDto {
  /** `JHN.3.16`, or `MAT.17.20-21` for verses the translation prints as one. */
  id: string;
  chapter: number;
  verse: number;
  verse_end?: number;
  text: string;
}

export interface PassageResult {
  ref: string;
  status: PassageStatus;
  /** Translation code the passage was resolved in. */
  translation?: string;
  book?: string;
  rendered?: string;
  text?: string;
  verses?: VerseDto[];
  source?: { rendered?: string; text?: string; verses?: VerseDto[] };
  notes: string[];
}

export interface ReferenceCheck {
  ref: string;
  status: PassageStatus;
  book?: string;
  normalized?: string;
  notes: string[];
}

// ---------------------------------------------------------------------------
// Action inputs

const ref = z.string().trim().min(1).max(200);
export const MAX_REFS = 100;

export const resolvePassagesSchema = z.object({
  refs: z.array(ref).min(1).max(MAX_REFS),
  /** A language code ("hr") or a translation code ("sar-hr"). */
  translation: z.string().trim().min(2).max(40),
  include: z
    .object({
      text: z.boolean().optional(),
      verses: z.boolean().optional(),
      rendered: z.boolean().optional(),
      source: z.boolean().optional(),
    })
    .optional(),
});

export const validateReferencesSchema = z.object({ refs: z.array(ref).min(1).max(MAX_REFS) });

export const chapterSchemaInput = z.object({
  translation: z.string().trim().min(2).max(40),
  book: z.string().trim().regex(/^[0-9A-Za-z]{3}$/),
  chapter: z.number().int().min(1).max(200),
});

export const translationCodeSchema = z.object({ code: z.string().regex(TRANSLATION_CODE).max(40) });

export const mappingInputSchema = z
  .object({
    code: z.string().regex(TRANSLATION_CODE).max(40),
    usfm: z.string().regex(/^[0-9A-Z]{3}$/),
    srcChapter: z.number().int().min(1).max(200),
    srcVerseFrom: z.number().int().min(0).max(1000).nullable(),
    srcVerseTo: z.number().int().min(0).max(1000).nullable(),
    dstChapter: z.number().int().min(1).max(200),
    offset: z.number().int().min(-1000).max(1000),
    unmappable: z.boolean(),
  })
  .refine((m) => m.srcVerseFrom !== null || m.srcVerseTo === null, {
    message: 'A verse range needs a first verse.',
    path: ['srcVerseFrom'],
  })
  .refine((m) => m.srcVerseFrom === null || m.srcVerseTo === null || m.srcVerseTo >= m.srcVerseFrom, {
    message: 'The last verse comes before the first.',
    path: ['srcVerseTo'],
  });

export type MappingInput = z.infer<typeof mappingInputSchema>;

export const declareBookSchema = z.object({
  code: z.string().regex(TRANSLATION_CODE).max(40),
  usfm: z.string().regex(/^[0-9A-Z]{3}$/),
  declared: z.boolean(),
  reviewed: z.boolean().optional(),
  note: z.string().max(2000).nullable().optional(),
});
