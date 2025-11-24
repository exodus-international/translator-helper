import prisma from '@/lib/db';

export async function getActivityLogsByDocumentVersion(documentVersionId: string) {
  return prisma.activityLog.findMany({
    where: { documentVersionId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

export async function getActivityLogById(id: string) {
  return prisma.activityLog.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
    },
  });
}

export async function createActivityLog(data: {
  documentVersionId: string;
  userId: string;
  action: string;
  details?: Record<string, any>;
}) {
  return prisma.activityLog.create({
    data: {
      documentVersionId: data.documentVersionId,
      userId: data.userId,
      action: data.action,
      details: data.details || {},
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
    },
  });
}

export async function getRecentActivityLogs(limit: number = 50) {
  return prisma.activityLog.findMany({
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
      documentVersion: {
        include: {
          document: {
            select: {
              id: true,
              title: true,
              slug: true,
            },
          },
          language: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
  });
}
