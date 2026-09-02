import prisma from '@/lib/db';
import type { DocumentType, Prisma } from '@prisma/client';

export async function listSourceProjects(options?: { includeComplete?: boolean }) {
  return prisma.sourceProject.findMany({
    where: options?.includeComplete
      ? undefined
      : {
          status: 'ACTIVE',
        },
    orderBy: {
      name: 'asc',
    },
    include: {
      _count: {
        select: {
          documents: true,
          translationProjects: true,
        },
      },
    },
  });
}

export async function getSourceProjectsForUser(userId: string, isAdmin: boolean) {
  return prisma.sourceProject.findMany({
    where: {
      status: 'ACTIVE',
      ...(!isAdmin
        ? {
            translationProjects: {
              some: {
                members: {
                  some: {
                    userId,
                  },
                },
              },
            },
          }
        : {}),
    },
    orderBy: {
      name: 'asc',
    },
    include: {
      _count: {
        select: {
          documents: true,
          translationProjects: true,
        },
      },
      translationProjects: {
        select: {
          id: true,
          languageId: true,
          language: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          members: {
            select: {
              userId: true,
            },
          },
        },
      },
    },
  });
}

const sourceProjectDetailInclude = {
  documents: {
    orderBy: {
      title: 'asc',
    },
  },
  translationProjects: {
    include: {
      language: true,
      _count: {
        select: {
          members: true,
        },
      },
    },
  },
} satisfies Prisma.SourceProjectInclude;

export async function getSourceProjectById(id: string) {
  return prisma.sourceProject.findUnique({
    where: { id },
    include: sourceProjectDetailInclude,
  });
}

/** The readable URL segment, e.g. "advent2025" in /projects/advent2025. */
export async function getSourceProjectByIdentifier(identifier: string) {
  return prisma.sourceProject.findUnique({
    where: { identifier },
    include: sourceProjectDetailInclude,
  });
}

export async function createSourceProject(data: {
  name: string;
  description?: string | null;
  identifier: string;
  acronym?: string | null;
}) {
  return prisma.sourceProject.create({
    data,
  });
}

export async function updateSourceProject(
  id: string,
  data: {
    name?: string;
    description?: string | null;
    identifier?: string;
    acronym?: string | null;
    status?: 'ACTIVE' | 'COMPLETE';
    audioDocumentTypes?: DocumentType[];
  },
) {
  return prisma.sourceProject.update({
    where: { id },
    data,
  });
}

export async function deleteSourceProject(id: string) {
  return prisma.sourceProject.delete({
    where: { id },
  });
}
