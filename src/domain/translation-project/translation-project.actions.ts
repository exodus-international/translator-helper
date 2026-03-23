'use server';

import { authorize } from '@/lib/authorize';
import { createTranslationProjectSchema, updateTranslationProjectSchema } from './translation-project.types';
import {
  listTranslationProjects,
  getTranslationProjectById,
  getTranslationProjectBySourceAndLanguage,
  createTranslationProject,
  updateTranslationProject,
  deleteTranslationProject,
  getTranslationProjectsByUser,
} from './translation-project.repository';

export async function listTranslationProjectsAction(filters?: { sourceProjectId?: string; languageId?: string }) {
  await authorize('authenticated');
  return await listTranslationProjects(filters);
}

export async function getTranslationProjectAction(id: string) {
  await authorize('authenticated');
  return await getTranslationProjectById(id);
}

export async function getTranslationProjectBySourceAndLanguageAction(sourceProjectId: string, languageId: string) {
  await authorize('authenticated');
  return await getTranslationProjectBySourceAndLanguage(sourceProjectId, languageId);
}

export async function createTranslationProjectAction(input: unknown) {
  await authorize('can:manage-folders');

  const validated = createTranslationProjectSchema.parse(input);
  return await createTranslationProject({
    name: validated.name,
    sourceProjectId: validated.sourceProjectId,
    languageId: validated.languageId,
  });
}

export async function updateTranslationProjectAction(id: string, input: unknown) {
  await authorize('can:manage-folders');

  const validated = updateTranslationProjectSchema.parse(input);
  return await updateTranslationProject(id, {
    name: validated.name,
  });
}

export async function deleteTranslationProjectAction(id: string) {
  await authorize('can:manage-folders');

  return await deleteTranslationProject(id);
}

export async function getTranslationProjectsByUserAction() {
  const { user } = await authorize('authenticated');
  return await getTranslationProjectsByUser(user.id);
}
