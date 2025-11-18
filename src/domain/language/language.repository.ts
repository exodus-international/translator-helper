import prisma from "@/lib/db";

export async function listLanguages() {
  return prisma.language.findMany({
    orderBy: {
      name: "asc",
    },
  });
}

export async function listTargetLanguages() {
  return prisma.language.findMany({
    where: {
      code: {
        not: "en",
      },
    },
    orderBy: {
      name: "asc",
    },
  });
}

export async function getLanguageById(id: string) {
  return prisma.language.findUnique({
    where: { id },
  });
}

export async function getLanguageByCode(code: string) {
  return prisma.language.findUnique({
    where: { code },
  });
}

export async function createLanguage(code: string, name: string) {
  return prisma.language.create({
    data: {
      code,
      name,
    },
  });
}

export async function updateLanguage(id: string, name: string) {
  return prisma.language.update({
    where: { id },
    data: { name },
  });
}

export async function updateLanguageInstructions(
  id: string,
  translationInstructions: string | null
) {
  return prisma.language.update({
    where: { id },
    data: { translationInstructions },
  });
}

export async function deleteLanguage(id: string) {
  return prisma.language.delete({
    where: { id },
  });
}
