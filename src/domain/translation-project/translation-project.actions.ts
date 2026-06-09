'use server';

import { authorize } from '@/lib/authorize';
import { createTranslationProjectSchema } from './translation-project.types';
import {
  listTranslationProjects,
  getTranslationProjectById,
  createTranslationProject,
} from './translation-project.repository';

export async function listTranslationProjectsAction(filters?: { sourceProjectId?: string; languageId?: string }) {
  await authorize('authenticated');
  return await listTranslationProjects(filters);
}

export async function getTranslationProjectAction(id: string) {
  await authorize('authenticated');
  return await getTranslationProjectById(id);
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
