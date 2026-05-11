import prisma from '@/lib/db';

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

export async function coalesceEditLog(data: {
  documentVersionId: string;
  userId: string;
  details?: Record<string, any>;
}) {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  const recentEditLog = await prisma.activityLog.findFirst({
    where: {
      documentVersionId: data.documentVersionId,
      userId: data.userId,
      action: 'edited',
      createdAt: { gte: fiveMinutesAgo },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (recentEditLog) {
    return prisma.activityLog.update({
      where: { id: recentEditLog.id },
      data: {
        createdAt: new Date(),
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

  return createActivityLog({
    documentVersionId: data.documentVersionId,
    userId: data.userId,
    action: 'edited',
    details: data.details || {},
  });
}
