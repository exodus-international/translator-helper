import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';

const userBrief = { select: { id: true, name: true, email: true } } as const;

const assignmentInclude = {
  document: { include: { sourceProject: true } },
  translationProject: { include: { sourceProject: true, language: true } },
  user: userBrief,
  assignedBy: userBrief,
} satisfies Prisma.DocumentAssignmentInclude;

const assignmentIncludeWithVersions = {
  ...assignmentInclude,
  document: {
    include: {
      sourceProject: true,
      versions: { include: { language: true } },
    },
  },
} satisfies Prisma.DocumentAssignmentInclude;

const assignmentIncludeForUserScoped = {
  document: assignmentIncludeWithVersions.document,
  translationProject: { include: { sourceProject: true, language: true } },
  assignedBy: userBrief,
} satisfies Prisma.DocumentAssignmentInclude;

type AssignmentWithVersions = Prisma.DocumentAssignmentGetPayload<{
  include: typeof assignmentIncludeWithVersions;
}>;
type Assignment = Prisma.DocumentAssignmentGetPayload<{
  include: typeof assignmentInclude;
}>;
type AssignmentForUserScoped = Prisma.DocumentAssignmentGetPayload<{
  include: typeof assignmentIncludeForUserScoped;
}>;

export async function listDocumentAssignments(filters?: {
  translationProjectId?: string;
  userId?: string;
  documentId?: string;
}): Promise<AssignmentWithVersions[]> {
  return prisma.documentAssignment.findMany({
    where: {
      ...(filters?.translationProjectId && {
        translationProjectId: filters.translationProjectId,
      }),
      ...(filters?.userId && { userId: filters.userId }),
      ...(filters?.documentId && { documentId: filters.documentId }),
    },
    include: assignmentIncludeWithVersions,
    orderBy: { assignedAt: 'desc' },
  });
}

export async function getDocumentAssignmentById(id: string): Promise<AssignmentWithVersions | null> {
  return prisma.documentAssignment.findUnique({
    where: { id },
    include: assignmentIncludeWithVersions,
  });
}

export async function getDocumentAssignmentByDocumentAndProject(
  documentId: string,
  translationProjectId: string,
): Promise<Assignment | null> {
  return prisma.documentAssignment.findUnique({
    where: { documentId_translationProjectId: { documentId, translationProjectId } },
    include: assignmentInclude,
  });
}

export async function createDocumentAssignment(data: {
  documentId: string;
  translationProjectId: string;
  userId: string | null;
  deadline: Date | null;
  assignedById: string;
}): Promise<Assignment> {
  return prisma.documentAssignment.create({
    data,
    include: assignmentInclude,
  });
}

export async function updateDocumentAssignment(
  id: string,
  data: {
    userId?: string | null;
    deadline?: Date | null;
  },
): Promise<Assignment> {
  return prisma.documentAssignment.update({
    where: { id },
    data,
    include: assignmentInclude,
  });
}

export async function deleteDocumentAssignment(id: string): Promise<Prisma.DocumentAssignmentGetPayload<{}>> {
  return prisma.documentAssignment.delete({
    where: { id },
  });
}

export async function getAssignedDocumentsForUser(
  userId: string,
  translationProjectId?: string,
): Promise<AssignmentForUserScoped[]> {
  return prisma.documentAssignment.findMany({
    where: {
      userId,
      ...(translationProjectId && { translationProjectId }),
    },
    include: assignmentIncludeForUserScoped,
    orderBy: {
      deadline: { sort: 'asc', nulls: 'last' },
    },
  });
}
