'use server';

import { authorize } from '@/lib/authorize';
import { parseInput } from '@/lib/validation';
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

  const validated = parseInput(createLanguageSchema, input);
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

  const validated = parseInput(updateLanguageSettingsSchema, input);

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

/**
 * Instructions are editorial rather than administrative: the people who know
 * how Croatian scripture quotations should read are the Croatian team, not
 * whoever happens to hold the admin flag. A language's Project Manager writes
 * them; admins still can, through the same gate.
 */
export async function updateLanguageInstructionsAction(id: string, input: unknown) {
  await authorize({ language: id, role: 'manager' });

  const validated = parseInput(updateLanguageInstructionsSchema, input);
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
