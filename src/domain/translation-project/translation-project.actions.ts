'use server';

import { requireUser } from '@/lib/session';
import { canManageFolders } from '@/lib/permissions';
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
  await requireUser();
  return await listTranslationProjects(filters);
}

export async function getTranslationProjectAction(id: string) {
  await requireUser();
  return await getTranslationProjectById(id);
}

export async function getTranslationProjectBySourceAndLanguageAction(sourceProjectId: string, languageId: string) {
  await requireUser();
  return await getTranslationProjectBySourceAndLanguage(sourceProjectId, languageId);
}

export async function createTranslationProjectAction(input: unknown) {
  const user = await requireUser();

  if (!canManageFolders(user)) {
    throw new Error('Forbidden: Only deployers can create translation projects');
  }

  const validated = createTranslationProjectSchema.parse(input);
  return await createTranslationProject({
    name: validated.name,
    sourceProjectId: validated.sourceProjectId,
    languageId: validated.languageId,
  });
}

export async function updateTranslationProjectAction(id: string, input: unknown) {
  const user = await requireUser();

  if (!canManageFolders(user)) {
    throw new Error('Forbidden: Only deployers can update translation projects');
  }

  const validated = updateTranslationProjectSchema.parse(input);
  return await updateTranslationProject(id, {
    name: validated.name,
  });
}

export async function deleteTranslationProjectAction(id: string) {
  const user = await requireUser();

  if (!canManageFolders(user)) {
    throw new Error('Forbidden: Only deployers can delete translation projects');
  }

  return await deleteTranslationProject(id);
}

export async function getTranslationProjectsByUserAction() {
  const user = await requireUser();
  return await getTranslationProjectsByUser(user.id);
}
