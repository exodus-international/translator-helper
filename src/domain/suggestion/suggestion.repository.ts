import prisma from '@/lib/db';
import { SuggestionFilters } from './suggestion.types';
import { SuggestionStatus, SuggestionType } from '@prisma/client';

const userSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
};

const repliesInclude = {
  replies: {
    include: {
      user: { select: userSelect },
    },
    orderBy: { createdAt: 'asc' as const },
  },
};

export async function getSuggestionsByDocumentVersion(
  documentVersionId: string,
  filters?: SuggestionFilters,
) {
  const where: any = { documentVersionId };

  if (filters) {
    if (filters.status && filters.status !== 'ALL') {
      where.status = filters.status;
    }
    if (filters.type && filters.type !== 'ALL') {
      where.type = filters.type;
    }
    if (filters.userId) {
      where.userId = filters.userId;
    }
  }

  return prisma.suggestion.findMany({
    where,
    include: {
      user: { select: userSelect },
      ...repliesInclude,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

export async function getSuggestionById(id: string) {
  return prisma.suggestion.findUnique({
    where: { id },
    include: {
      user: { select: userSelect },
      ...repliesInclude,
      documentVersion: {
        select: {
          id: true,
          content: true,
          version: true,
        },
      },
    },
  });
}

export async function createSuggestion(data: {
  documentVersionId: string;
  userId: string;
  startLine?: number | null;
  startColumn?: number | null;
  endLine?: number | null;
  endColumn?: number | null;
  type: SuggestionType;
  comment: string;
  proposedText?: string | null;
  version: number;
}) {
  return prisma.suggestion.create({
    data,
    include: {
      user: { select: userSelect },
      ...repliesInclude,
    },
  });
}

export async function updateSuggestionStatus(
  id: string,
  status: SuggestionStatus,
  dismissedReason?: string | null,
) {
  return prisma.suggestion.update({
    where: { id },
    data: {
      status,
      dismissedReason: dismissedReason ?? null,
    },
    include: {
      user: { select: userSelect },
      ...repliesInclude,
    },
  });
}

export async function deleteSuggestion(id: string) {
  return prisma.suggestion.delete({
    where: { id },
  });
}

export async function createSuggestionReply(data: {
  suggestionId: string;
  userId: string;
  content: string;
}) {
  return prisma.suggestionReply.create({
    data,
    include: {
      user: { select: userSelect },
    },
  });
}

export async function deleteSuggestionReply(id: string) {
  return prisma.suggestionReply.delete({
    where: { id },
  });
}

export async function getSuggestionReplyById(id: string) {
  return prisma.suggestionReply.findUnique({
    where: { id },
    include: {
      user: { select: userSelect },
    },
  });
}

export async function checkSuggestionConflict(suggestionId: string, currentContent: string) {
  const suggestion = await getSuggestionById(suggestionId);
  if (!suggestion) {
    return { hasConflict: false };
  }

  if (suggestion.startLine == null || suggestion.endLine == null || suggestion.startColumn == null || suggestion.endColumn == null) {
    return { hasConflict: false };
  }

  const lines = currentContent.split('\n');
  const suggestionStartLine = suggestion.startLine - 1; // Convert to 0-based
  const suggestionEndLine = suggestion.endLine - 1;

  // Check if the range is still valid
  if (suggestionStartLine >= lines.length || suggestionEndLine >= lines.length) {
    return { hasConflict: true, reason: 'Range out of bounds' };
  }

  // Get the current text at the range
  if (suggestionStartLine === suggestionEndLine) {
    const line = lines[suggestionStartLine];
    const currentText = line.substring(suggestion.startColumn - 1, suggestion.endColumn - 1);
    // For now, just check if range is valid - full conflict detection can be added later
    return { hasConflict: false, currentText };
  } else {
    // Multi-line range
    const firstLine = lines[suggestionStartLine].substring(suggestion.startColumn - 1);
    const lastLine = lines[suggestionEndLine].substring(0, suggestion.endColumn - 1);
    const middleLines = lines.slice(suggestionStartLine + 1, suggestionEndLine);
    const currentText = [firstLine, ...middleLines, lastLine].join('\n');
    return { hasConflict: false, currentText };
  }
}
