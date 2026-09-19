'use server';

import { authorize } from '@/lib/authorize';
import {
  countLanguageDependents,
  createLanguage,
  deleteLanguage,
  getLanguageById,
  updateLanguageInstructions,
  updateLanguageSettings,
} from './language.repository';
import { assertLanguageDeletable } from './language-delete';
import {
  createLanguageSchema,
  updateLanguageInstructionsSchema,
  updateLanguageSettingsSchema,
} from './language.types';

export async function createLanguageAction(input: unknown) {
  await authorize('can:manage-languages');

  const validated = createLanguageSchema.parse(input);
  return await createLanguage(validated.code, validated.name, validated.branchName);
}

/**
 * Name, branch and voice are saved together: they are one form, and saving them
 * one action at a time is how the old admin dialog left a language half-updated
 * when the second call failed. `code` is not accepted -- the schema is strict,
 * so an attempt to change the URL is rejected here rather than relied upon to
 * be impossible in the form.
 */
export async function updateLanguageSettingsAction(id: string, input: unknown) {
  await authorize('can:manage-languages');

  const language = await getLanguageById(id);
  if (!language) {
    throw new Error('Language not found');
  }

  const validated = updateLanguageSettingsSchema.parse(input);

  // Nothing deploys into the source language and nothing is spoken in it, so
  // its branch and voice stay null rather than being editable and inert.
  if (language.isSource) {
    return await updateLanguageSettings(id, {
      name: validated.name,
      branchName: null,
      audioProvider: null,
      audioVoice: null,
    });
  }

  if (!validated.branchName) {
    throw new Error('A GitHub branch is required: without one, every deploy of this language fails.');
  }

  return await updateLanguageSettings(id, validated);
}

export async function updateLanguageInstructionsAction(id: string, input: unknown) {
  await authorize('can:manage-languages');

  const validated = updateLanguageInstructionsSchema.parse(input);
  return await updateLanguageInstructions(id, validated.translationInstructions ?? null);
}

export async function deleteLanguageAction(id: string, confirmation: string) {
  await authorize('can:manage-languages');

  const language = await getLanguageById(id);
  if (!language) {
    throw new Error('Language not found');
  }

  assertLanguageDeletable(language, await countLanguageDependents(id), confirmation);

  return await deleteLanguage(id);
}
