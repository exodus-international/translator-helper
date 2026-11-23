import { userBrief } from '@/domain/user/user.select';
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
        ...userBrief,
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
    // A merged entry spans the whole burst of edits, so it keeps the text from
    // before the first one.
    const previous = recentEditLog.details as Record<string, any> | null;
    const details =
      data.details && 'before' in data.details && previous && 'before' in previous
        ? { ...data.details, before: previous.before }
        : data.details || {};
    return prisma.activityLog.update({
      where: { id: recentEditLog.id },
      data: {
        createdAt: new Date(),
        details,
      },
      include: {
        user: {
          ...userBrief,
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
