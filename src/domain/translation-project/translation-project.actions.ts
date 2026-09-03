'use server';

import { authorize } from '@/lib/authorize';
import { createTranslationProjectSchema } from './translation-project.types';
import {
  listTranslationProjects,
  getTranslationProjectById,
  createTranslationProject,
} from './translation-project.repository';
import prisma from '@/lib/db';
import { createMissingDocumentVersions } from '../document-version/document-version.repository';

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
  const translationProject = await createTranslationProject({
    name: validated.name,
    sourceProjectId: validated.sourceProjectId,
    languageId: validated.languageId,
  });

  // Seed a version per document so the new language starts with a full board
  // rather than documents that render as gaps until someone opens them.
  const documents = await prisma.document.findMany({
    where: { sourceProjectId: validated.sourceProjectId },
    select: { id: true },
  });
  await createMissingDocumentVersions(
    documents.map((document) => document.id),
    [validated.languageId],
  );

  return translationProject;
}
