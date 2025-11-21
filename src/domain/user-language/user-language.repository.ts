import prisma from "@/lib/db";

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
        name: "asc",
      },
    },
  });
}

export async function getUserLanguageIds(userId: string): Promise<string[]> {
  const userLanguages = await prisma.userLanguage.findMany({
    where: {
      userId,
    },
    select: {
      languageId: true,
    },
  });

  return userLanguages.map((ul) => ul.languageId);
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

export async function userHasLanguage(userId: string, languageId: string): Promise<boolean> {
  const userLanguage = await prisma.userLanguage.findUnique({
    where: {
      userId_languageId: {
        userId,
        languageId,
      },
    },
  });

  return !!userLanguage;
}

export async function getUserLanguagesCount(userId: string): Promise<number> {
  return prisma.userLanguage.count({
    where: {
      userId,
    },
  });
}


