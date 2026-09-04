'use server';

import { authorize } from '@/lib/authorize';
import { createTranslationProjectSchema } from './translation-project.types';
import {
  countTranslationProjects,
  listTranslationProjects,
  listTranslationProjectsPaginated,
  getTranslationProjectById,
  createTranslationProject,
  type TranslationProjectSort,
} from './translation-project.repository';
import prisma from '@/lib/db';
import { createMissingDocumentVersions } from '../document-version/document-version.repository';

export async function listTranslationProjectsAction(filters?: { sourceProjectId?: string; languageId?: string }) {
  await authorize('authenticated');
  return await listTranslationProjects(filters);
}

/**
 * Server-side pagination, search, and sorting for the per-project
 * translation-projects list (issue #51). Returns the page plus the total
 * for the range line.
 *
 * The count and the page are two independent queries, so a concurrent
 * insert can make the total disagree with the page by one row. Fine at
 * this scale; the pagination range clamps defensively regardless.
 */
export async function listTranslationProjectsPaginatedAction(filters: {
  sourceProjectId?: string;
  languageId?: string;
  search?: string;
  sort?: TranslationProjectSort;
  order?: 'asc' | 'desc';
  skip?: number;
  take?: number;
}) {
  await authorize('authenticated');
  const [translationProjects, total] = await Promise.all([
    listTranslationProjectsPaginated(filters),
    countTranslationProjects(filters),
  ]);
  return { translationProjects, total };
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
