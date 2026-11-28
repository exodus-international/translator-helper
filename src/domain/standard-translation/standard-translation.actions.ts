'use server';

import { revalidatePath } from 'next/cache';
import { authorize } from '@/lib/authorize';
import { parseInput } from '@/lib/validation';
import { languageScopeSchema } from '@/domain/user-language/user-language.types';
import {
  createStandardTranslation,
  deleteStandardTranslation,
  getMoveConflict,
  moveStandardTranslationToGeneral,
  updateStandardTranslation,
} from './standard-translation.repository';
import { authorizeEntry } from './standard-translation.permissions';
import {
  createStandardTranslationSchema,
  moveStandardTranslationSchema,
  updateStandardTranslationSchema,
} from './standard-translation.types';

/**
 * A language's dictionary is its whole team's: every member writes it, in any
 * role, and admins write every language's. An existing entry is checked by
 * `authorizeEntry`, against its stored language, never one from the input.
 *
 * Reads for the page happen in its server component, after
 * `resolveInstructionsAccess`; only the move dialog's read is here.
 */
const PAGE_PATH = '/standard-translations';

export async function createStandardTranslationAction(input: unknown) {
  const { languageId } = parseInput(languageScopeSchema, input);
  const { user } = await authorize({ language: languageId, role: 'member' });

  const validated = parseInput(createStandardTranslationSchema, input);
  const created = await createStandardTranslation(validated, user.id);
  revalidatePath(PAGE_PATH);
  return created;
}

export async function updateStandardTranslationAction(id: string, input: unknown) {
  await authorize('authenticated');
  const { user } = await authorizeEntry(id);

  const validated = parseInput(updateStandardTranslationSchema, input);
  const updated = await updateStandardTranslation(id, validated, user.id);
  revalidatePath(PAGE_PATH);
  return updated;
}

export async function deleteStandardTranslationAction(id: string): Promise<void> {
  await authorize('authenticated');
  await authorizeEntry(id);

  await deleteStandardTranslation(id);
  revalidatePath(PAGE_PATH);
}

/** The general entry a move would clash with, for the dialog to show beside this one. */
export async function getStandardTranslationMoveConflictAction(id: string) {
  await authorize('authenticated');
  await authorizeEntry(id);

  return await getMoveConflict(id);
}

export async function moveStandardTranslationToGeneralAction(id: string, input: unknown) {
  await authorize('authenticated');
  const { user } = await authorizeEntry(id);

  const { keep } = parseInput(moveStandardTranslationSchema, input);
  const kept = await moveStandardTranslationToGeneral(id, keep, user.id);
  revalidatePath(PAGE_PATH);
  return kept;
}
