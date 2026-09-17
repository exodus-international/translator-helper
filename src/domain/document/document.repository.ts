import { userBrief } from '@/domain/user/user.select';
import prisma from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { DocumentType, SuggestionStatus } from '@/generated/prisma/enums';

const userWithLanguages = {
  select: {
    id: true,
    name: true,
    email: true,
    image: true,
    languages: { select: { languageId: true } },
  },
} as const;

const versionWithUser = {
  include: { language: true, user: userWithLanguages },
  orderBy: { updatedAt: 'desc' },
} as const;

/**
 * The documents list, without the markdown.
 *
 * `include` here returned every version's `content` — the same bug already
 * fixed on the documents overview below. Nothing in the list renders a
 * document body, so the body does not travel.
 */
const documentListSelect = {
  id: true,
  slug: true,
  title: true,
  labels: true,
  type: true,
  deadline: true,
  originalFilename: true,
  folderId: true,
  sourceProjectId: true,
  createdAt: true,
  updatedAt: true,
  sourceProject: true,
  versions: {
    select: {
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
      language: true,
      user: userWithLanguages,
    },
    orderBy: { updatedAt: 'desc' },
  },
} satisfies Prisma.DocumentSelect;

const documentDetailInclude = {
  folder: true, // Deprecated
  sourceProject: true,
  versions: versionWithUser,
} satisfies Prisma.DocumentInclude;

const documentBasicInclude = {
  folder: true, // Deprecated
  sourceProject: true,
  versions: true,
} satisfies Prisma.DocumentInclude;

export type DocumentList = Prisma.DocumentGetPayload<{ select: typeof documentListSelect }>;
type DocumentDetail = Prisma.DocumentGetPayload<{ include: typeof documentDetailInclude }>;
type DocumentBasic = Prisma.DocumentGetPayload<{ include: typeof documentBasicInclude }>;

export async function listDocuments(filters?: {
  sourceProjectId?: string;
  folderId?: string; // Deprecated - kept for backward compatibility
  labels?: string[];
  search?: string;
}): Promise<DocumentList[]> {
  return prisma.document.findMany({
    where: {
      ...(filters?.sourceProjectId && { sourceProjectId: filters.sourceProjectId }),
      ...(filters?.folderId && { folderId: filters.folderId }), // Deprecated
      ...(filters?.labels &&
        filters.labels.length > 0 && {
          labels: { hasSome: filters.labels },
        }),
      ...(filters?.search && {
        OR: [
          { title: { contains: filters.search, mode: 'insensitive' } },
          { slug: { contains: filters.search, mode: 'insensitive' } },
        ],
      }),
    },
    select: documentListSelect,
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getDocumentById(id: string): Promise<DocumentDetail | null> {
  return prisma.document.findUnique({
    where: { id },
    include: documentDetailInclude,
  });
}

/**
 * Resolves the URL form /documents/{project}/{slug}/... to a document.
 *
 * findFirst rather than findUnique: slug is unique per project, but the
 * constraint is on sourceProjectId, and callers hold the identifier.
 */
export async function getDocumentByProjectAndSlug(
  projectIdentifier: string,
  slug: string,
): Promise<DocumentDetail | null> {
  return prisma.document.findFirst({
    where: { slug, sourceProject: { identifier: projectIdentifier } },
    include: documentDetailInclude,
  });
}

export async function createDocument(data: {
  slug: string;
  title: string;
  sourceProjectId: string;
  folderId?: string; // Deprecated - kept for backward compatibility
  labels: string[];
  deadline?: Date;
  originalFilename?: string;
  type?: DocumentType;
}): Promise<DocumentBasic> {
  return prisma.document.create({
    data: {
      slug: data.slug,
      title: data.title,
      sourceProjectId: data.sourceProjectId,
      folderId: data.folderId, // Deprecated
      labels: data.labels,
      deadline: data.deadline,
      originalFilename: data.originalFilename,
      type: data.type,
    },
    include: documentBasicInclude,
  });
}

export async function updateDocument(
  id: string,
  data: {
    title?: string;
    sourceProjectId?: string | null;
    folderId?: string | null; // Deprecated - kept for backward compatibility
    labels?: string[];
    deadline?: Date | null;
    type?: DocumentType | null;
    originalFilename?: string | null;
  },
): Promise<DocumentBasic> {
  return prisma.document.update({
    where: { id },
    data,
    include: documentBasicInclude,
  });
}

export async function deleteDocument(id: string): Promise<Prisma.DocumentGetPayload<{}>> {
  return prisma.document.delete({
    where: { id },
  });
}

/**
 * The Documents Overview renders one row per document with a status dot per
 * language. It reads nothing else, so this selects those fields and no more.
 *
 * Using `include` here instead pulls every version's `content` — the full
 * markdown of every translation in every language — plus each version's user
 * and that user's language list, and serializes the lot into the RSC payload
 * that ships to the browser. That was megabytes in production for a table
 * that displays a coloured circle.
 */
const documentOverviewSelect = {
  id: true,
  slug: true,
  title: true,
  labels: true,
  type: true,
  originalFilename: true,
  sourceProjectId: true,
  sourceProject: { select: { id: true, name: true, identifier: true } },
  versions: {
    select: { id: true, languageId: true, status: true },
  },
} satisfies Prisma.DocumentSelect;

export type DocumentOverview = Prisma.DocumentGetPayload<{ select: typeof documentOverviewSelect }>;

export const DOCUMENT_OVERVIEW_SORTS = ['title', 'filename', 'type', 'createdAt', 'updatedAt', 'status'] as const;
export type DocumentOverviewSort = (typeof DOCUMENT_OVERVIEW_SORTS)[number];

function documentOverviewWhere(filters: {
  search?: string;
  sourceProjectId?: string;
  types?: DocumentType[];
}): Prisma.DocumentWhereInput {
  const search = filters.search?.trim();
  return {
    ...(filters.sourceProjectId && { sourceProjectId: filters.sourceProjectId }),
    ...(filters.types && filters.types.length > 0 && { type: { in: filters.types } }),
    ...(search && {
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { originalFilename: { contains: search, mode: 'insensitive' } },
        { sourceProject: { name: { contains: search, mode: 'insensitive' } } },
      ],
    }),
  };
}

function documentOverviewOrderBy(sort: DocumentOverviewSort, order: 'asc' | 'desc'): Prisma.DocumentOrderByWithRelationInput[] {
  // A document has no single status — versions carry it per language. Ordering
  // by the version count is the closest server-side proxy: fewer versions
  // means fewer languages started, i.e. less translation progress.
  if (sort === 'status') {
    return [{ versions: { _count: order } }, { title: 'asc' }, { id: 'asc' }];
  }
  // URL-facing sort keys mapped to Prisma fields. Nulls stay at the bottom
  // either way: Postgres would otherwise dump every null row on page 1 when
  // flipping to desc.
  if (sort === 'filename') {
    return [{ originalFilename: { sort: order, nulls: 'last' } }, { id: 'asc' }];
  }
  // Native Postgres enums sort by declaration order, not by label — the UI
  // labels this pair "Type ↑ / ↓" rather than "A–Z" to stay honest.
  if (sort === 'type') {
    return [{ type: { sort: order, nulls: 'last' } }, { id: 'asc' }];
  }
  return [{ [sort]: order } as Prisma.DocumentOrderByWithRelationInput, { id: 'asc' }];
}

export async function countDocumentsOverview(filters: {
  search?: string;
  sourceProjectId?: string;
  types?: DocumentType[];
}): Promise<number> {
  return prisma.document.count({ where: documentOverviewWhere(filters) });
}

// Server-side pagination, search, and sorting for the Documents Overview
// (issue #51). Keeps the lean overview select — never the version contents.
export async function listDocumentsOverviewPaginated(filters: {
  search?: string;
  sourceProjectId?: string;
  types?: DocumentType[];
  sort?: DocumentOverviewSort;
  order?: 'asc' | 'desc';
  skip?: number;
  take?: number;
}): Promise<DocumentOverview[]> {
  const sort: DocumentOverviewSort = filters.sort && DOCUMENT_OVERVIEW_SORTS.includes(filters.sort)
    ? filters.sort
    : 'updatedAt';
  const order = filters.order === 'asc' ? 'asc' : 'desc';
  return prisma.document.findMany({
    where: documentOverviewWhere(filters),
    select: documentOverviewSelect,
    orderBy: documentOverviewOrderBy(sort, order),
    ...(filters.skip !== undefined && { skip: filters.skip }),
    ...(filters.take !== undefined && { take: filters.take }),
  });
}

export async function getDashboardDocuments(
  languageId: string,
  sourceProjectId?: string,
): Promise<
  Prisma.DocumentGetPayload<{
    include: {
      sourceProject: true;
      versions: {
        include: {
          language: true;
          user: typeof userWithLanguages;
        };
      };
    };
  }>[]
> {
  const documents = await prisma.document.findMany({
    where: {
      ...(sourceProjectId && { sourceProjectId }),
    },
    include: {
      sourceProject: true,
      // The version carries the assignment (translator, reviewer, deadline).
      versions: {
        where: { languageId },
        include: {
          language: true,
          user: userWithLanguages,
          reviewer: userBrief,
          assignedBy: userBrief,
          activityLogs: { orderBy: { createdAt: 'desc' } },
        },
        orderBy: { updatedAt: 'desc' },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const versionIds = documents.flatMap((doc) => doc.versions.map((v) => v.id));
  if (versionIds.length === 0) {
    return documents;
  }

  const grouped = await prisma.suggestion.groupBy({
    by: ['documentVersionId'],
    where: {
      documentVersionId: { in: versionIds },
      status: SuggestionStatus.OPEN,
    },
    _count: { _all: true },
  });

  const countByVersionId = new Map(grouped.map((g) => [g.documentVersionId, g._count._all]));

  return documents.map((doc) => ({
    ...doc,
    versions: doc.versions.map((v) => ({
      ...v,
      openSuggestionsCount: countByVersionId.get(v.id) ?? 0,
    })),
  }));
}
