import prisma from '@/lib/db';
import { Prisma, ProjectRole } from '@prisma/client';

export async function listProjectMembers(translationProjectId: string): Promise<
  Prisma.ProjectMemberGetPayload<{
    include: {
      user: {
        select: {
          id: true;
          name: true;
          email: true;
        };
      };
    };
  }>[]
> {
  return prisma.projectMember.findMany({
    where: {
      translationProjectId,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });
}

export async function getProjectMemberById(id: string): Promise<Prisma.ProjectMemberGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        name: true;
        email: true;
      };
    };
    translationProject: {
      include: {
        sourceProject: true;
        language: true;
      };
    };
  };
}> | null> {
  return prisma.projectMember.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      translationProject: {
        include: {
          sourceProject: true,
          language: true,
        },
      },
    },
  });
}

export async function createProjectMember(data: {
  translationProjectId: string;
  userId: string;
  role: ProjectRole;
}): Promise<
  Prisma.ProjectMemberGetPayload<{
    include: {
      user: {
        select: {
          id: true;
          name: true;
          email: true;
        };
      };
      translationProject: {
        include: {
          sourceProject: true;
          language: true;
        };
      };
    };
  }>
> {
  return prisma.projectMember.create({
    data,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      translationProject: {
        include: {
          sourceProject: true,
          language: true,
        },
      },
    },
  });
}

export async function deleteProjectMember(id: string): Promise<Prisma.ProjectMemberGetPayload<{}>> {
  return prisma.projectMember.delete({
    where: { id },
  });
}

export async function deleteProjectMembersByUser(
  userId: string,
  translationProjectId: string,
): Promise<Prisma.BatchPayload> {
  return prisma.projectMember.deleteMany({
    where: {
      userId,
      translationProjectId,
    },
  });
}

export async function getUserRolesInProject(userId: string, translationProjectId: string): Promise<ProjectRole[]> {
  const members = await prisma.projectMember.findMany({
    where: {
      translationProjectId,
      userId,
    },
    select: {
      role: true,
    },
  });

  return members.map((m) => m.role);
}

export async function isUserProjectManagerForSourceProject(userId: string, sourceProjectId: string): Promise<boolean> {
  const projectMember = await prisma.projectMember.findFirst({
    where: {
      userId,
      role: ProjectRole.PROJECT_MANAGER,
      translationProject: {
        sourceProjectId,
      },
    },
  });

  return !!projectMember;
}

export async function getProjectReviewers(translationProjectId: string) {
  return prisma.projectMember.findMany({
    where: {
      translationProjectId,
      role: {
        in: [ProjectRole.REVIEWER, ProjectRole.EDITOR, ProjectRole.PROJECT_MANAGER],
      },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    distinct: ['userId'],
    orderBy: {
      user: {
        name: 'asc',
      },
    },
  });
}

export async function isUserMemberOfSourceProject(userId: string, sourceProjectId: string): Promise<boolean> {
  const projectMember = await prisma.projectMember.findFirst({
    where: {
      userId,
      translationProject: {
        sourceProjectId,
      },
    },
  });

  return !!projectMember;
}
