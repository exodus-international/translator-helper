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
  // If status is explicitly provided, use it. Otherwise, determine it based on content
  // If content is provided and not empty, set to IN_PROGRESS, otherwise PENDING_TRANSLATION
  const finalStatus =
    data.status !== undefined
      ? data.status
      : data.content.trim()
        ? DocumentStatus.IN_PROGRESS
        : DocumentStatus.PENDING_TRANSLATION;

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

  // If status is PENDING_TRANSLATION and content is provided, change to IN_PROGRESS
  const newStatus =
    current.status === DocumentStatus.PENDING_TRANSLATION && content.trim()
      ? DocumentStatus.IN_PROGRESS
      : current.status;

  // Update with incremented version
  return prisma.documentVersion.update({
    where: { id },
    data: {
      content,
      userId,
      status: newStatus,
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
    },
  });
}

export async function updateDocumentVersionStatus(id: string, status: DocumentStatus) {
  return prisma.documentVersion.update({
    where: { id },
    data: { status },
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
    },
  });
}

export async function deleteDocumentVersion(id: string) {
  return prisma.documentVersion.delete({
    where: { id },
  });
}
