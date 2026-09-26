import { userBrief } from '@/domain/user/user.select';
import prisma from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { DocumentStatus } from '@/generated/prisma/enums';

/**
 * The shape the assignment lists render: who, which document, which language,
 * what state, by when.
 *
 * A `select` rather than an `include` because `include` also returns `content`
 * — the whole markdown body of every version in the list. document.repository
 * already learned this lesson on the documents overview; these lists are the
 * same bug, on a table whose rows are kilobytes each.
 */
export const assignmentSelect = {
  id: true,
  documentId: true,
  languageId: true,
  status: true,
  version: true,
  deadline: true,
  assignedAt: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
  reviewerId: true,
  assignedById: true,
  document: {
    select: {
      id: true,
      slug: true,
      title: true,
      type: true,
      labels: true,
      sourceProjectId: true,
      sourceProject: { select: { id: true, name: true, slug: true, acronym: true } },
    },
  },
  language: { select: { id: true, name: true, code: true } },
  user: userBrief,
  reviewer: userBrief,
  assignedBy: userBrief,
} satisfies Prisma.DocumentVersionSelect;

/** A version as the dashboard and translation-project lists render it. */
export type VersionAssignment = Prisma.DocumentVersionGetPayload<{ select: typeof assignmentSelect }>;

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
      user: userBrief,
      reviewer: userBrief,
      comments: {
        include: {
          user: userBrief,
        },
        orderBy: {
          createdAt: 'desc',
        },
      },
      activityLogs: {
        include: {
          user: userBrief,
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
      user: userBrief,
      reviewer: userBrief,
      comments: {
        include: {
          user: userBrief,
        },
        orderBy: {
          createdAt: 'desc',
        },
      },
      activityLogs: {
        include: {
          user: userBrief,
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
  userId: string | null;
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
      user: userBrief,
      reviewer: userBrief,
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
      user: userBrief,
      reviewer: userBrief,
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
      user: userBrief,
      reviewer: userBrief,
    },
  });
}

/**
 * Gives the version to `userId` and moves it to IN_PROGRESS, whatever its
 * status was. Only starting a translation does this; every other status move
 * goes through the workflow's transition rules.
 */
export async function claimDocumentVersion(id: string, userId: string) {
  return prisma.documentVersion.update({
    where: { id },
    data: { userId, status: DocumentStatus.IN_PROGRESS },
    include: {
      document: true,
      language: true,
      user: userBrief,
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

// ─── Assignment ──────────────────────────────────────────────
// Assignment lives on the version itself; these replace the former
// DocumentAssignment repository.

/**
 * Sets (or clears) the translator and deadline for a document in a language,
 * creating the version if it does not exist yet. A version with no translator is
 * unassigned and visible to the whole language team.
 */
export async function assignDocumentVersion(data: {
  documentId: string;
  languageId: string;
  userId: string | null;
  deadline: Date | null;
  assignedById: string;
}) {
  const assignment = {
    userId: data.userId,
    deadline: data.deadline,
    assignedById: data.assignedById,
    assignedAt: new Date(),
  };

  return prisma.documentVersion.upsert({
    where: {
      documentId_languageId: { documentId: data.documentId, languageId: data.languageId },
    },
    create: {
      documentId: data.documentId,
      languageId: data.languageId,
      content: '',
      status: DocumentStatus.PENDING_TRANSLATION,
      version: 1,
      ...assignment,
    },
    update: assignment,
    select: assignmentSelect,
  });
}

/** Just the language a version belongs to, for the checks that gate on it. */
export async function getDocumentVersionLanguage(id: string): Promise<{ languageId: string } | null> {
  return prisma.documentVersion.findUnique({ where: { id }, select: { languageId: true } });
}

/** Every version a user is assigned to translate, soonest deadline first. */
/**
 * A user's active work: versions where they are the translator or the reviewer,
 * excluding terminal statuses. APPROVED versions are surfaced separately as
 * "Waiting for Deploy" (deployers only) and DEPLOYED work is finished, so
 * neither belongs in "My Work".
 */
export async function getWorkVersionsForUser(userId: string): Promise<VersionAssignment[]> {
  return prisma.documentVersion.findMany({
    where: {
      status: { notIn: [DocumentStatus.APPROVED, DocumentStatus.DEPLOYED] },
      OR: [{ userId }, { reviewerId: userId }],
    },
    select: assignmentSelect,
    orderBy: {
      deadline: { sort: 'asc', nulls: 'last' },
    },
  });
}

/**
 * How much unfinished work each member of a language is carrying, keyed by user
 * id. Removing someone with work in flight is the one destructive action on the
 * team page, so the number has to be beside them before they are removed.
 *
 * "Open" is the same rule `getWorkVersionsForUser` uses for My Work -- the
 * member is translator or reviewer, and the status is neither APPROVED nor
 * DEPLOYED -- so a member's count here and their dashboard cannot disagree. A
 * version whose translator is also its reviewer counts once per role, for the
 * same reason My Work lists it twice: it is two things to do.
 */
export async function countOpenWorkByMember(languageId: string): Promise<Map<string, number>> {
  const where = {
    languageId,
    status: { notIn: [DocumentStatus.APPROVED, DocumentStatus.DEPLOYED] },
  };

  const [asTranslator, asReviewer] = await Promise.all([
    prisma.documentVersion.groupBy({
      by: ['userId'],
      where: { ...where, userId: { not: null } },
      _count: { _all: true },
    }),
    prisma.documentVersion.groupBy({
      by: ['reviewerId'],
      where: { ...where, reviewerId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const counts = new Map<string, number>();
  for (const group of asTranslator) {
    if (group.userId) counts.set(group.userId, (counts.get(group.userId) ?? 0) + group._count._all);
  }
  for (const group of asReviewer) {
    if (group.reviewerId) counts.set(group.reviewerId, (counts.get(group.reviewerId) ?? 0) + group._count._all);
  }

  return counts;
}

/** The versions belonging to a translation project — its language, its documents. */
export async function listVersionsForTranslationProject(
  sourceProjectId: string,
  languageId: string,
): Promise<VersionAssignment[]> {
  return prisma.documentVersion.findMany({
    where: {
      languageId,
      document: { sourceProjectId },
    },
    select: assignmentSelect,
    orderBy: [{ deadline: { sort: 'asc', nulls: 'last' } }, { document: { title: 'asc' } }],
  });
}

/**
 * The (document, language) pairs that have no version yet — every combination
 * minus the ones already present. Pure, so the eager-creation rule can be tested
 * without a database.
 */
export function missingVersionPairs(
  documentIds: string[],
  languageIds: string[],
  existing: { documentId: string; languageId: string }[],
): { documentId: string; languageId: string }[] {
  const present = new Set(existing.map((v) => `${v.documentId}:${v.languageId}`));

  return documentIds.flatMap((documentId) =>
    languageIds
      .filter((languageId) => !present.has(`${documentId}:${languageId}`))
      .map((languageId) => ({ documentId, languageId })),
  );
}

/**
 * Creates the missing PENDING_TRANSLATION versions for the given documents and
 * languages, so a document is never without a version to render. Existing
 * versions are left untouched.
 */
export async function createMissingDocumentVersions(documentIds: string[], languageIds: string[]) {
  if (documentIds.length === 0 || languageIds.length === 0) {
    return 0;
  }

  const existing = await prisma.documentVersion.findMany({
    where: { documentId: { in: documentIds }, languageId: { in: languageIds } },
    select: { documentId: true, languageId: true },
  });

  const missing = missingVersionPairs(documentIds, languageIds, existing);
  if (missing.length === 0) {
    return 0;
  }

  // skipDuplicates guards against a concurrent creator racing us to the same row.
  const { count } = await prisma.documentVersion.createMany({
    data: missing.map((pair) => ({
      ...pair,
      content: '',
      status: DocumentStatus.PENDING_TRANSLATION,
      version: 1,
    })),
    skipDuplicates: true,
  });
  return count;
}

/** Counts versions per language for a source project, keyed by language id. */
export async function countVersionsByLanguage(sourceProjectId: string): Promise<Map<string, number>> {
  const rows = await prisma.documentVersion.groupBy({
    by: ['languageId'],
    where: { document: { sourceProjectId } },
    _count: { _all: true },
  });

  return new Map(rows.map((row) => [row.languageId, row._count._all]));
}
