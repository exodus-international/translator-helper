import prisma from '@/lib/db';
import { DocumentStatus, Prisma } from '@prisma/client';

const userBrief = { select: { id: true, name: true, email: true } } as const;

const assignmentInclude = {
  document: { include: { sourceProject: true } },
  language: true,
  user: userBrief,
  reviewer: userBrief,
  assignedBy: userBrief,
} satisfies Prisma.DocumentVersionInclude;

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
    include: assignmentInclude,
  });
}

/** Every version a user is assigned to translate, soonest deadline first. */
/**
 * A user's active work: versions where they are the translator or the reviewer,
 * excluding terminal statuses. APPROVED versions are surfaced separately as
 * "Waiting for Deploy" (deployers only) and DEPLOYED work is finished, so
 * neither belongs in "My Work".
 */
export async function getWorkVersionsForUser(userId: string) {
  return prisma.documentVersion.findMany({
    where: {
      status: { notIn: [DocumentStatus.APPROVED, DocumentStatus.DEPLOYED] },
      OR: [{ userId }, { reviewerId: userId }],
    },
    include: assignmentInclude,
    orderBy: {
      deadline: { sort: 'asc', nulls: 'last' },
    },
  });
}

/** The versions belonging to a translation project — its language, its documents. */
export async function listVersionsForTranslationProject(sourceProjectId: string, languageId: string) {
  return prisma.documentVersion.findMany({
    where: {
      languageId,
      document: { sourceProjectId },
    },
    include: assignmentInclude,
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
