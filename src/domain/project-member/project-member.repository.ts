import prisma from '@/lib/db';
import { ProjectRole } from '@prisma/client';

export async function listProjectMembers(translationProjectId: string) {
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

export async function getProjectMemberById(id: string) {
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

export async function getProjectMembersByUserAndProject(userId: string, translationProjectId: string) {
  return prisma.projectMember.findMany({
    where: {
      translationProjectId,
      userId,
    },
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

export async function createProjectMember(data: { translationProjectId: string; userId: string; role: ProjectRole }) {
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

export async function updateProjectMember(id: string, data: { role: ProjectRole }) {
  return prisma.projectMember.update({
    where: { id },
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

export async function deleteProjectMember(id: string) {
  return prisma.projectMember.delete({
    where: { id },
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

// Legacy function for backward compatibility - returns first role or null
export async function getUserRoleInProject(userId: string, translationProjectId: string): Promise<ProjectRole | null> {
  const roles = await getUserRolesInProject(userId, translationProjectId);
  return roles.length > 0 ? roles[0] : null;
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
