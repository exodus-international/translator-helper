'use server';

import { authorize } from '@/lib/authorize';
import {
  createLanguage,
  deleteLanguage,
  updateLanguage,
  updateLanguageBranchName,
  updateLanguageInstructions,
} from './language.repository';
import {
  createLanguageSchema,
  updateLanguageBranchNameSchema,
  updateLanguageInstructionsSchema,
  updateLanguageSchema,
} from './language.types';


export async function createLanguageAction(input: unknown) {
  await authorize('can:manage-languages');

  const validated = createLanguageSchema.parse(input);
  return await createLanguage(validated.code, validated.name, validated.branchName);
}

export async function updateLanguageAction(id: string, input: unknown) {
  await authorize('can:manage-languages');

  const validated = updateLanguageSchema.parse(input);
  if (!validated.name) {
    throw new Error('Name is required');
  }

  return await updateLanguage(id, validated.name);
}

export async function updateLanguageInstructionsAction(id: string, input: unknown) {
  await authorize('can:manage-languages');

  const validated = updateLanguageInstructionsSchema.parse(input);
  return await updateLanguageInstructions(id, validated.translationInstructions ?? null);
}

export async function updateLanguageBranchNameAction(id: string, input: unknown) {
  await authorize('can:manage-languages');

  const validated = updateLanguageBranchNameSchema.parse(input);
  return await updateLanguageBranchName(id, validated.branchName);
}

export async function deleteLanguageAction(id: string) {
  await authorize('can:manage-languages');

  return await deleteLanguage(id);
}
