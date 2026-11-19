'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { authorize } from '@/lib/authorize';
import {
  addMapping,
  BibleImportError,
  deleteMapping,
  deleteTranslation,
  listMappings,
  setBookDeclaration,
  setLanguageDefault,
} from './bible.repository';
import {
  bibleForLanguage,
  getChapter,
  invalidateBibleIndex,
  listBooks,
  listTranslations,
  resolvePassages,
  searchBible,
  validateReferences,
} from './bible.service';
import {
  chapterSchemaInput,
  declareBookSchema,
  LANGUAGE_CODE,
  mappingInputSchema,
  resolvePassagesSchema,
  searchSchema,
  translationCodeSchema,
  validateReferencesSchema,
} from './bible.types';

/**
 * Reading the Bible is open to everyone signed in; changing what is imported
 * and how it is versified is for administrators. Imports go through
 * /api/admin/bible/import, since a Bible is larger than an action's body limit.
 */

type Outcome<T> = { ok: true; data: T } | { ok: false; error: string };

/** A rule the data refused (no such book, a source has no versification) comes back as a message, not a 500. */
async function admin<T>(work: () => Promise<T>): Promise<Outcome<T>> {
  try {
    const data = await work();
    invalidateBibleIndex();
    revalidatePath('/admin/bible', 'layout');
    return { ok: true, data };
  } catch (error) {
    if (error instanceof BibleImportError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function resolvePassagesAction(input: unknown) {
  await authorize('authenticated');
  const { refs, translation, include } = resolvePassagesSchema.parse(input);
  return resolvePassages(refs, translation, include);
}

export async function validateReferencesAction(input: unknown) {
  await authorize('authenticated');
  const { refs } = validateReferencesSchema.parse(input);
  return validateReferences(refs);
}

export async function getBibleChapterAction(input: unknown) {
  await authorize('authenticated');
  const { translation, book, chapter } = chapterSchemaInput.parse(input);
  return getChapter(translation, book, chapter);
}

export async function searchBibleAction(input: unknown) {
  await authorize('authenticated');
  const { translation, q, book, limit } = searchSchema.parse(input);
  return searchBible(translation, q, { book, limit });
}

export async function listBibleTranslationsAction() {
  await authorize('authenticated');
  return listTranslations();
}

export async function listBibleBooksAction(translation: unknown) {
  await authorize('authenticated');
  return listBooks(z.string().trim().min(2).max(40).parse(translation));
}

/** The Bible a document language resolves to, or null when none is imported. */
export async function bibleForLanguageAction(languageCode: unknown) {
  await authorize('authenticated');
  return bibleForLanguage(z.string().trim().toLowerCase().regex(LANGUAGE_CODE).parse(languageCode));
}

export async function listBibleMappingsAction(code: unknown, usfm: unknown) {
  await authorize('admin');
  const parsed = translationCodeSchema.parse({ code });
  return listMappings(parsed.code, z.string().regex(/^[0-9A-Z]{3}$/).parse(usfm));
}

export async function deleteBibleTranslationAction(code: unknown) {
  await authorize('admin');
  const parsed = translationCodeSchema.parse({ code });
  return admin(() => deleteTranslation(parsed.code));
}

export async function setBibleLanguageDefaultAction(code: unknown) {
  await authorize('admin');
  const parsed = translationCodeSchema.parse({ code });
  return admin(() => setLanguageDefault(parsed.code));
}

export async function setBibleBookDeclarationAction(input: unknown) {
  await authorize('admin');
  const { code, usfm, declared, reviewed, note } = declareBookSchema.parse(input);
  return admin(() => setBookDeclaration(code, usfm, declared, reviewed, note));
}

export async function addBibleMappingAction(input: unknown) {
  await authorize('admin');
  const parsed = mappingInputSchema.parse(input);
  return admin(() => addMapping(parsed));
}

export async function deleteBibleMappingAction(code: unknown, mappingId: unknown) {
  await authorize('admin');
  const parsed = translationCodeSchema.parse({ code });
  const id = z.string().uuid().parse(mappingId);
  return admin(() => deleteMapping(parsed.code, id));
}
