import prisma from '@/lib/db';

export async function listTranslationProjects(filters?: { sourceProjectId?: string; languageId?: string }) {
  return prisma.translationProject.findMany({
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
      _count: {
        select: {
          documentAssignments: true,
        },
      },
    },
  });
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
      documentAssignments: {
        include: {
          document: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          assignedBy: {
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
