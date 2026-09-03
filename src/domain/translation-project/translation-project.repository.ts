import prisma from '@/lib/db';
import { countVersionsByLanguage } from '../document-version/document-version.repository';

/**
 * A translation project's documents are the versions in its language, so the
 * count is derived rather than stored — there is no relation from the project to
 * DocumentVersion to hang a Prisma `_count` on.
 */
export async function listTranslationProjects(filters?: { sourceProjectId?: string; languageId?: string }) {
  const translationProjects = await prisma.translationProject.findMany({
    where: {
      ...(filters?.sourceProjectId && { sourceProjectId: filters.sourceProjectId }),
      ...(filters?.languageId && { languageId: filters.languageId }),
    },
    orderBy: {
      name: 'asc',
    },
    include: {
      sourceProject: true,
      language: true,
      members: {
        select: {
          userId: true,
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
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
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
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
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
