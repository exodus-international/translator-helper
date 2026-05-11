import prisma from '@/lib/db';

async function getUserLanguages(userId: string) {
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

export async function setUserLanguages(userId: string, languageIds: string[]) {
  // Delete existing user languages
  await prisma.userLanguage.deleteMany({
    where: {
      userId,
    },
  });

  // Create new user languages
  if (languageIds.length > 0) {
    await prisma.userLanguage.createMany({
      data: languageIds.map((languageId) => ({
        userId,
        languageId,
      })),
    });
  }

  // Return updated user languages
  return getUserLanguages(userId);
}

export async function getUserLanguagesCount(userId: string): Promise<number> {
  return prisma.userLanguage.count({
    where: {
      userId,
    },
  });
}
