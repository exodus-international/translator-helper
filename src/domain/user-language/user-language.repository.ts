import prisma from '@/lib/db';
import { ProjectRole } from '@prisma/client';

/**
 * Access control is language-based: a UserLanguage row grants its role on every
 * translation project in that language. These queries are the single pivot point
 * for `authorize({ project, role })` and the source-project permission helpers.
 */

const REVIEWER_ELIGIBLE_ROLES = [ProjectRole.REVIEWER, ProjectRole.EDITOR, ProjectRole.PROJECT_MANAGER];

const memberUserSelect = {
  id: true,
  name: true,
  email: true,
} as const;

export async function getUserLanguages(userId: string) {
  return prisma.userLanguage.findMany({
    where: {
      userId,
    },
    include: {
      language: true,
    },
    orderBy: {
      language: {
        name: 'asc',
      },
    },
  });
}

/**
 * Replaces the user's language assignments, preserving the role on languages the
 * user already had. Languages added here start at the lowest role (TRANSLATOR);
 * use `setUserLanguageRole` to promote.
 */
export async function setUserLanguages(userId: string, languageIds: string[]) {
  await prisma.$transaction([
    prisma.userLanguage.deleteMany({
      where: {
        userId,
        languageId: { notIn: languageIds },
      },
    }),
    // An empty `update` is what preserves the role of a language the user keeps.
    ...languageIds.map((languageId) =>
      prisma.userLanguage.upsert({
        where: { userId_languageId: { userId, languageId } },
        create: { userId, languageId, role: ProjectRole.TRANSLATOR },
        update: {},
      }),
    ),
  ]);

  return getUserLanguages(userId);
}

export async function getUserLanguagesCount(userId: string): Promise<number> {
  return prisma.userLanguage.count({
    where: {
      userId,
    },
  });
}

// ─── Project access ──────────────────────────────────────────

/**
 * The roles a user holds on a translation project, resolved through the
 * project's language. Returns at most one role — kept as an array so the
 * `authorize()` gateway and its call sites stay unchanged.
 */
export async function getUserRolesInProject(userId: string, translationProjectId: string): Promise<ProjectRole[]> {
  const userLanguage = await prisma.userLanguage.findFirst({
    where: {
      userId,
      language: {
        translationProjects: {
          some: { id: translationProjectId },
        },
      },
    },
    select: { role: true },
  });

  return userLanguage ? [userLanguage.role] : [];
}

/** The user's role for a language, or null when they are not assigned to it. */
export async function getUserRoleForLanguage(userId: string, languageId: string): Promise<ProjectRole | null> {
  const userLanguage = await prisma.userLanguage.findUnique({
    where: { userId_languageId: { userId, languageId } },
    select: { role: true },
  });

  return userLanguage?.role ?? null;
}

/** Everyone with access to a translation project, via its language. */
export async function listTranslationProjectMembers(translationProjectId: string) {
  return prisma.userLanguage.findMany({
    where: {
      language: {
        translationProjects: {
          some: { id: translationProjectId },
        },
      },
    },
    include: {
      user: { select: memberUserSelect },
    },
    orderBy: {
      user: { name: 'asc' },
    },
  });
}

/** Everyone assigned to a language, with their role. */
export async function listLanguageMembers(languageId: string) {
  return prisma.userLanguage.findMany({
    where: { languageId },
    include: {
      user: { select: memberUserSelect },
    },
    orderBy: {
      user: { name: 'asc' },
    },
  });
}

export async function getProjectReviewers(translationProjectId: string) {
  return prisma.userLanguage.findMany({
    where: {
      role: { in: REVIEWER_ELIGIBLE_ROLES },
      language: {
        translationProjects: {
          some: { id: translationProjectId },
        },
      },
    },
    include: {
      user: { select: memberUserSelect },
    },
    orderBy: {
      user: { name: 'asc' },
    },
  });
}

export async function isUserProjectManagerForSourceProject(userId: string, sourceProjectId: string): Promise<boolean> {
  const match = await prisma.userLanguage.findFirst({
    where: {
      userId,
      role: ProjectRole.PROJECT_MANAGER,
      language: {
        translationProjects: {
          some: { sourceProjectId },
        },
      },
    },
    select: { id: true },
  });

  return !!match;
}

export async function isUserMemberOfSourceProject(userId: string, sourceProjectId: string): Promise<boolean> {
  const match = await prisma.userLanguage.findFirst({
    where: {
      userId,
      language: {
        translationProjects: {
          some: { sourceProjectId },
        },
      },
    },
    select: { id: true },
  });

  return !!match;
}

// ─── Membership CRUD ─────────────────────────────────────────

/** Grants (or changes) a user's role for a language. */
export async function setUserLanguageRole(userId: string, languageId: string, role: ProjectRole) {
  return prisma.userLanguage.upsert({
    where: { userId_languageId: { userId, languageId } },
    create: { userId, languageId, role },
    update: { role },
    include: {
      user: { select: memberUserSelect },
      language: true,
    },
  });
}

/** Revokes a user's access to every project in a language. */
export async function removeUserFromLanguage(userId: string, languageId: string) {
  return prisma.userLanguage.deleteMany({
    where: { userId, languageId },
  });
}

export async function getLanguageIdForTranslationProject(translationProjectId: string): Promise<string | null> {
  const translationProject = await prisma.translationProject.findUnique({
    where: { id: translationProjectId },
    select: { languageId: true },
  });

  return translationProject?.languageId ?? null;
}
