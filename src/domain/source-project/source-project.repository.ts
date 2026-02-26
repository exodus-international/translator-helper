import prisma from '@/lib/db';

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

export async function getSourceProjectsForUser(userId: string, isDeployer: boolean) {
  return prisma.sourceProject.findMany({
    where: {
      status: 'ACTIVE',
      ...(!isDeployer
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
          _count: {
            select: {
              members: true,
            },
          },
        },
      },
    },
  });
}

export async function getSourceProjectById(id: string) {
  return prisma.sourceProject.findUnique({
    where: { id },
    include: {
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
    },
  });
}

export async function createSourceProject(data: { name: string; description?: string | null; identifier?: string }) {
  return prisma.sourceProject.create({
    data,
  });
}

export async function updateSourceProject(
  id: string,
  data: { name?: string; description?: string | null; identifier?: string | null; status?: 'ACTIVE' | 'COMPLETE' },
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
