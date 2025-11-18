import prisma from "@/lib/db";

export async function listFolders() {
  return prisma.folder.findMany({
    orderBy: {
      name: "asc",
    },
    include: {
      _count: {
        select: {
          documents: true,
        },
      },
    },
  });
}

export async function getFolderById(id: string) {
  return prisma.folder.findUnique({
    where: { id },
    include: {
      documents: {
        orderBy: {
          title: "asc",
        },
      },
    },
  });
}

export async function createFolder(name: string) {
  return prisma.folder.create({
    data: { name },
  });
}

export async function updateFolder(id: string, name: string) {
  return prisma.folder.update({
    where: { id },
    data: { name },
  });
}

export async function deleteFolder(id: string) {
  return prisma.folder.delete({
    where: { id },
  });
}
