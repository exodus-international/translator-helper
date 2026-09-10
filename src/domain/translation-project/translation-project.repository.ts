import prisma from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
import { countVersionsByLanguage } from '../document-version/document-version.repository';

export const TRANSLATION_PROJECT_SORTS = ['name', 'createdAt'] as const;
export type TranslationProjectSort = (typeof TRANSLATION_PROJECT_SORTS)[number];

function translationProjectListWhere(filters: {
  sourceProjectId?: string;
  languageId?: string;
  search?: string;
}): Prisma.TranslationProjectWhereInput {
  const search = filters.search?.trim();
  return {
    ...(filters?.sourceProjectId && { sourceProjectId: filters.sourceProjectId }),
    ...(filters?.languageId && { languageId: filters.languageId }),
    ...(search && { name: { contains: search, mode: 'insensitive' } }),
  };
}

export async function countTranslationProjects(filters: {
  sourceProjectId?: string;
  languageId?: string;
  search?: string;
}): Promise<number> {
  return prisma.translationProject.count({ where: translationProjectListWhere(filters) });
}

/**
 * A translation project's documents are the versions in its language, so the
 * count is derived rather than stored — there is no relation from the project to
 * DocumentVersion to hang a Prisma `_count` on.
 */
export async function listTranslationProjects(filters?: { sourceProjectId?: string; languageId?: string }) {
  return listTranslationProjectsPaginated(filters ?? {});
}

/**
 * Server-side pagination, search, and sorting for the per-project
 * translation-projects list (issue #51). Translation projects carry no
 * status of their own, so sorting is by name and creation date.
 */
export async function listTranslationProjectsPaginated(filters: {
  sourceProjectId?: string;
  languageId?: string;
  search?: string;
  sort?: TranslationProjectSort;
  order?: 'asc' | 'desc';
  skip?: number;
  take?: number;
}) {
  const sort: TranslationProjectSort =
    filters.sort && TRANSLATION_PROJECT_SORTS.includes(filters.sort) ? filters.sort : 'name';
  const order = filters.order === 'desc' ? 'desc' : 'asc';
  const translationProjects = await prisma.translationProject.findMany({
    where: translationProjectListWhere(filters),
    orderBy: [{ [sort]: order } as Prisma.TranslationProjectOrderByWithRelationInput, { id: 'asc' }],
    ...(filters.skip !== undefined && { skip: filters.skip }),
    ...(filters.take !== undefined && { take: filters.take }),
    include: {
      sourceProject: true,
      language: {
        include: {
          users: {
            select: {
              userId: true,
            },
          },
        },
      },
    },
  });

  // One grouped count per source project involved (callers scope to one today).
  const sourceProjectIds = [...new Set(translationProjects.map((tp) => tp.sourceProjectId))];
  const countsBySourceProject = new Map(
    await Promise.all(sourceProjectIds.map(async (id) => [id, await countVersionsByLanguage(id)] as const)),
  );

  return translationProjects.map((translationProject) => ({
    ...translationProject,
    documentCount:
      countsBySourceProject.get(translationProject.sourceProjectId)?.get(translationProject.languageId) ?? 0,
  }));
}

export async function getTranslationProjectById(id: string) {
  return prisma.translationProject.findUnique({
    where: { id },
    include: {
      sourceProject: {
        include: {
          documents: true,
        },
      },
      language: true,
    },
  });
}

export async function getTranslationProjectBySourceAndLanguage(sourceProjectId: string, languageId: string) {
  return prisma.translationProject.findUnique({
    where: {
      sourceProjectId_languageId: {
        sourceProjectId,
        languageId,
      },
    },
    include: {
      sourceProject: true,
      language: true,
    },
  });
}

export async function createTranslationProject(data: { name: string; sourceProjectId: string; languageId: string }) {
  return prisma.translationProject.create({
    data,
    include: {
      sourceProject: true,
      language: true,
    },
  });
}
