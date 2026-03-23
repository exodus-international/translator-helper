import prisma from '@/lib/db';
import { DocumentStatus } from '@prisma/client';

export async function getDocumentVersionById(id: string) {
  return prisma.documentVersion.findUnique({
    where: { id },
    include: {
      document: {
        include: {
          folder: true,
        },
      },
      language: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      reviewer: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      comments: {
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
          createdAt: 'desc',
        },
      },
      activityLogs: {
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
          createdAt: 'desc',
        },
      },
    },
  });
}

export async function getDocumentVersionByDocumentAndLanguage(documentId: string, languageId: string) {
  return prisma.documentVersion.findUnique({
    where: {
      documentId_languageId: {
        documentId,
        languageId,
      },
    },
    include: {
      document: {
        include: {
          folder: true,
        },
      },
      language: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      reviewer: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      comments: {
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
          createdAt: 'desc',
        },
      },
      activityLogs: {
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
          createdAt: 'desc',
        },
      },
    },
  });
}

export async function createDocumentVersion(data: {
  documentId: string;
  languageId: string;
  content: string;
  status?: DocumentStatus;
  userId: string;
}) {
  const finalStatus = data.status ?? DocumentStatus.PENDING_TRANSLATION;

  return prisma.documentVersion.create({
    data: {
      documentId: data.documentId,
      languageId: data.languageId,
      content: data.content,
      status: finalStatus,
      userId: data.userId,
      version: 1,
    },
    include: {
      document: true,
      language: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      reviewer: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
}

export async function updateDocumentVersion(id: string, content: string, userId: string) {
  // Get current version
  const current = await prisma.documentVersion.findUnique({
    where: { id },
  });

  if (!current) {
    throw new Error('Document version not found');
  }

  // Update with incremented version (status unchanged — transitions are explicit)
  return prisma.documentVersion.update({
    where: { id },
    data: {
      content,
      userId,
      version: current.version + 1,
      updatedAt: new Date(),
    },
    include: {
      document: true,
      language: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      reviewer: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
}

export async function updateDocumentVersionStatus(id: string, status: DocumentStatus, reviewerId?: string) {
  return prisma.documentVersion.update({
    where: { id },
    data: {
      status,
      ...(reviewerId !== undefined ? { reviewerId } : {}),
    },
    include: {
      document: true,
      language: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      reviewer: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
}

export async function deleteDocumentVersion(id: string) {
  return prisma.documentVersion.delete({
    where: { id },
  });
}

export async function deleteDocumentVersionsByDocumentId(documentId: string) {
  return prisma.documentVersion.deleteMany({
    where: { documentId },
  });
}
