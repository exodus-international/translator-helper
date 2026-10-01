import prisma from '@/lib/db';

/**
 * Rows the seed creates, looked up the way a person would name them.
 *
 * Ids are assigned at seed time, so a test asks for "the translator" or
 * "Slovak" and gets whatever id this run gave them. Everything here mirrors
 * `prisma/seed-data/datasets.ts`.
 */

export const SEEDED_USERS = {
  admin: 'admin@example.org',
  admin2: 'admin2@example.org',
  translator: 'translator@example.org',
  /** A project manager of German who is not an administrator. */
  translator2: 'translator2@example.org',
  reviewer: 'reviewer@example.org',
  banned: 'banned@example.org',
} as const;

export async function seededUser(email: string) {
  return prisma.user.findUniqueOrThrow({ where: { email } });
}

export async function seededLanguage(code: string) {
  return prisma.language.findUniqueOrThrow({ where: { code } });
}

export async function seededSourceProject(slug: string) {
  return prisma.sourceProject.findUniqueOrThrow({ where: { slug } });
}

/** The translation project for one source project in one language. */
export async function seededTranslationProject(projectSlug: string, languageCode: string) {
  return prisma.translationProject.findFirstOrThrow({
    where: { sourceProject: { slug: projectSlug }, language: { code: languageCode } },
  });
}

export async function seededDocument(slug: string) {
  return prisma.document.findFirstOrThrow({ where: { slug } });
}

/** The version of one document in one language, as the seed left it. */
export async function seededVersion(documentSlug: string, languageCode: string) {
  return prisma.documentVersion.findFirstOrThrow({
    where: { document: { slug: documentSlug }, language: { code: languageCode } },
  });
}
