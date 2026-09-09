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

export const SOURCE_PROJECT_SORTS = ['name', 'createdAt', 'status'] as const;
export type SourceProjectSort = (typeof SOURCE_PROJECT_SORTS)[number];

const sourceProjectListInclude = {
  _count: {
    select: {
      documents: true,
      translationProjects: true,
    },
  },
} satisfies Prisma.SourceProjectInclude;

export type SourceProjectListItem = Prisma.SourceProjectGetPayload<{
  include: typeof sourceProjectListInclude;
}>;

function sourceProjectListWhere(filters: {
  search?: string;
  includeComplete?: boolean;
}): Prisma.SourceProjectWhereInput {
  const search = filters.search?.trim();
  return {
    ...(filters.includeComplete ? {} : { status: 'ACTIVE' as const }),
    ...(search && { name: { contains: search, mode: 'insensitive' } }),
  };
}

export async function countSourceProjects(filters: {
  search?: string;
  includeComplete?: boolean;
}): Promise<number> {
  return prisma.sourceProject.count({ where: sourceProjectListWhere(filters) });
}

// Server-side pagination, search, and sorting for the admin projects list
// (issue #51).
export async function listSourceProjectsPaginated(filters: {
  search?: string;
  includeComplete?: boolean;
  sort?: SourceProjectSort;
  order?: 'asc' | 'desc';
  skip?: number;
  take?: number;
}): Promise<SourceProjectListItem[]> {
  const sort: SourceProjectSort =
    filters.sort && SOURCE_PROJECT_SORTS.includes(filters.sort) ? filters.sort : 'name';
  const order = filters.order === 'desc' ? 'desc' : 'asc';
  return prisma.sourceProject.findMany({
    where: sourceProjectListWhere(filters),
    orderBy: [{ [sort]: order } as Prisma.SourceProjectOrderByWithRelationInput, { id: 'asc' }],
    include: sourceProjectListInclude,
    ...(filters.skip !== undefined && { skip: filters.skip }),
    ...(filters.take !== undefined && { take: filters.take }),
  });
}

/** Access is language-based: a source project is visible once the user is
 * assigned to a language it is being translated into. */
export async function getSourceProjectsForUser(userId: string, isAdmin: boolean) {
  return prisma.sourceProject.findMany({
    where: {
      status: 'ACTIVE',
      ...(!isAdmin
        ? {
            translationProjects: {
              some: {
                language: {
                  users: {
                    some: {
                      userId,
                    },
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
              users: {
                select: {
                  userId: true,
                },
              },
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
      language: {
        include: {
          _count: {
            select: {
              users: true,
            },
          },
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
