'use server';

import { canManageLanguages } from '@/lib/permissions';
import { requireUser } from '@/lib/session';
import {
  createLanguage,
  deleteLanguage,
  getLanguageById,
  listLanguages,
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

export async function listLanguagesAction() {
  await requireUser();
  return await listLanguages();
}

export async function getLanguageAction(id: string) {
  await requireUser();
  return await getLanguageById(id);
}

export async function createLanguageAction(input: unknown) {
  const user = await requireUser();

  if (!canManageLanguages(user)) {
    throw new Error('Forbidden: Only deployers can manage languages');
  }

  const validated = createLanguageSchema.parse(input);
  return await createLanguage(validated.code, validated.name, validated.branchName);
}

export async function updateLanguageAction(id: string, input: unknown) {
  const user = await requireUser();

  if (!canManageLanguages(user)) {
    throw new Error('Forbidden: Only deployers can manage languages');
  }

  const validated = updateLanguageSchema.parse(input);
  if (!validated.name) {
    throw new Error('Name is required');
  }

  return await updateLanguage(id, validated.name);
}

export async function updateLanguageInstructionsAction(id: string, input: unknown) {
  const user = await requireUser();

  if (!canManageLanguages(user)) {
    throw new Error('Forbidden: Only deployers can manage languages');
  }

  const validated = updateLanguageInstructionsSchema.parse(input);
  return await updateLanguageInstructions(id, validated.translationInstructions ?? null);
}

export async function updateLanguageBranchNameAction(id: string, input: unknown) {
  const user = await requireUser();

  if (!canManageLanguages(user)) {
    throw new Error('Forbidden: Only deployers can manage languages');
  }

  const validated = updateLanguageBranchNameSchema.parse(input);
  return await updateLanguageBranchName(id, validated.branchName);
}

export async function deleteLanguageAction(id: string) {
  const user = await requireUser();

  if (!canManageLanguages(user)) {
    throw new Error('Forbidden: Only deployers can manage languages');
  }

  return await deleteLanguage(id);
}
