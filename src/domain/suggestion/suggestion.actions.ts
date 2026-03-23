'use server';

import { canReviewInProject, canTranslateInProject, isDeployer } from '@/lib/permissions';
import { requireUser } from '@/lib/session';
import { SuggestionStatus, SuggestionType } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { createActivityLog } from '../activity-log/activity-log.repository';
import { getDocumentById } from '../document/document.repository';
import { getDocumentVersionById, updateDocumentVersion } from '../document-version/document-version.repository';
import { getTranslationProjectBySourceAndLanguage } from '../translation-project/translation-project.repository';
import {
  applySuggestionSchema,
  createSuggestionReplySchema,
  createSuggestionSchema,
  dismissSuggestionSchema,
  editSuggestionSchema,
  reopenSuggestionSchema,
  updateSuggestionStatusSchema,
} from './suggestion.types';
import {
  checkSuggestionConflict,
  createSuggestion,
  createSuggestionReply,
  deleteSuggestion,
  deleteSuggestionReply,
  getSuggestionById,
  getSuggestionReplyById,
  getSuggestionsByDocumentVersion,
  updateSuggestionContent,
  updateSuggestionStatus,
} from './suggestion.repository';

function truncate(text: string, max = 80) {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

export async function getSuggestionsByDocumentVersionAction(documentVersionId: string, filters?: any) {
  await requireUser();
  return await getSuggestionsByDocumentVersion(documentVersionId, filters);
}

export async function getSuggestionByIdAction(id: string) {
  await requireUser();
  return await getSuggestionById(id);
}

export async function createSuggestionAction(input: unknown) {
  const user = await requireUser();
  const validated = createSuggestionSchema.parse(input);

  // Get document version to check permissions
  const documentVersion = await getDocumentVersionById(validated.documentVersionId);
  if (!documentVersion) {
    throw new Error('Document version not found');
  }

  // Get document to find source project
  const document = await getDocumentById(documentVersion.documentId);
  if (!document || !document.sourceProjectId) {
    throw new Error('Document not found or not associated with a source project');
  }

  // Get translation project
  const translationProject = await getTranslationProjectBySourceAndLanguage(
    document.sourceProjectId,
    documentVersion.languageId,
  );

  if (translationProject) {
    // Check if user can review in this project (only reviewers can create suggestions)
    const canReview = await canReviewInProject(user, translationProject.id, validated.documentVersionId);
    if (!canReview) {
      throw new Error('You do not have permission to create suggestions in this project');
    }
  } else {
    // Fallback: check basic review permission
    if (!isDeployer(user)) {
      throw new Error('You do not have permission to create suggestions');
    }
  }

  // Validate that proposedText is provided for CHANGE type
  if (validated.type === SuggestionType.CHANGE && !validated.proposedText) {
    throw new Error('Proposed text is required for CHANGE type suggestions');
  }

  // Validate that proposedText is not provided for COMMENT type
  if (validated.type === SuggestionType.COMMENT && validated.proposedText) {
    throw new Error('Proposed text should not be provided for COMMENT type suggestions');
  }

  const suggestion = await createSuggestion({
    ...validated,
    comment: validated.comment ?? '',
    userId: user.id,
    startLine: validated.startLine ?? null,
    startColumn: validated.startColumn ?? null,
    endLine: validated.endLine ?? null,
    endColumn: validated.endColumn ?? null,
    proposedText: validated.proposedText || null,
  });

  await createActivityLog({
    documentVersionId: validated.documentVersionId,
    userId: user.id,
    action: 'created_suggestion',
    details: {
      suggestionId: suggestion.id,
      type: validated.type,
      startLine: validated.startLine ?? null,
      endLine: validated.endLine ?? null,
      comment: validated.comment ? truncate(validated.comment) : null,
    },
  });

  revalidatePath(`/documents/${documentVersion.documentId}/review`);

  return suggestion;
}

export async function applySuggestionAction(input: unknown) {
  const user = await requireUser();
  const validated = applySuggestionSchema.parse(input);

  // Get suggestion
  const suggestion = await getSuggestionById(validated.suggestionId);
  if (!suggestion) {
    throw new Error('Suggestion not found');
  }

  if (suggestion.status !== SuggestionStatus.OPEN) {
    throw new Error('Only open suggestions can be applied');
  }

  if (suggestion.type !== SuggestionType.CHANGE) {
    throw new Error('Only CHANGE type suggestions can be applied');
  }

  if (!suggestion.proposedText) {
    throw new Error('Suggestion does not have proposed text');
  }

  if (
    suggestion.startLine == null ||
    suggestion.endLine == null ||
    suggestion.startColumn == null ||
    suggestion.endColumn == null
  ) {
    throw new Error('Cannot apply a suggestion without a text range');
  }

  // Get document version
  const documentVersion = await getDocumentVersionById(suggestion.documentVersionId);
  if (!documentVersion) {
    throw new Error('Document version not found');
  }

  // Get document to find source project
  const document = await getDocumentById(documentVersion.documentId);
  if (!document || !document.sourceProjectId) {
    throw new Error('Document not found or not associated with a source project');
  }

  // Get translation project
  const translationProject = await getTranslationProjectBySourceAndLanguage(
    document.sourceProjectId,
    documentVersion.languageId,
  );

  if (translationProject) {
    // Check if user can translate/edit in this project
    const canTranslate = await canTranslateInProject(user, translationProject.id);
    if (!canTranslate) {
      throw new Error('You do not have permission to apply suggestions in this project');
    }
  } else {
    // Fallback: check basic permissions
    if (!isDeployer(user)) {
      throw new Error('You do not have permission to apply suggestions');
    }
  }

  // Apply the suggestion by replacing the text at the range
  const lines = documentVersion.content.split('\n');
  const startLine = suggestion.startLine - 1; // Convert to 0-based
  const endLine = suggestion.endLine - 1;
  const startColumn = suggestion.startColumn - 1;
  const endColumn = suggestion.endColumn - 1;

  if (startLine >= lines.length || endLine >= lines.length) {
    throw new Error('Suggestion range is out of bounds');
  }

  // Extract the original text at the range before replacing
  let originalText: string;
  if (startLine === endLine) {
    const line = lines[startLine];
    originalText = line.substring(startColumn, endColumn);
  } else {
    const firstLine = lines[startLine].substring(startColumn);
    const lastLine = lines[endLine].substring(0, endColumn);
    const middleLines = lines.slice(startLine + 1, endLine);
    originalText = [firstLine, ...middleLines, lastLine].join('\n');
  }

  // Replace the text
  if (startLine === endLine) {
    // Single line replacement
    const line = lines[startLine];
    const before = line.substring(0, startColumn);
    const after = line.substring(endColumn);
    lines[startLine] = before + suggestion.proposedText + after;
  } else {
    // Multi-line replacement
    const firstLine = lines[startLine];
    const lastLine = lines[endLine];
    const before = firstLine.substring(0, startColumn);
    const after = lastLine.substring(endColumn);
    const newLines = [before + suggestion.proposedText + after];
    lines.splice(startLine, endLine - startLine + 1, ...newLines);
  }

  const newContent = lines.join('\n');

  // Update document version
  const updatedVersion = await updateDocumentVersion(suggestion.documentVersionId, newContent, user.id);

  // Update suggestion status and store original text for potential revert
  await updateSuggestionStatus(validated.suggestionId, SuggestionStatus.APPLIED, null, originalText);

  // Log the activity
  await createActivityLog({
    documentVersionId: suggestion.documentVersionId,
    userId: user.id,
    action: 'applied_suggestion',
    details: {
      suggestionId: suggestion.id,
      type: suggestion.type,
      range: {
        startLine: suggestion.startLine,
        startColumn: suggestion.startColumn,
        endLine: suggestion.endLine,
        endColumn: suggestion.endColumn,
      },
    },
  });

  revalidatePath(`/documents/${documentVersion.documentId}/review`);

  return updatedVersion;
}

export async function dismissSuggestionAction(input: unknown) {
  const user = await requireUser();
  const validated = dismissSuggestionSchema.parse(input);

  // Get suggestion
  const suggestion = await getSuggestionById(validated.suggestionId);
  if (!suggestion) {
    throw new Error('Suggestion not found');
  }

  if (suggestion.status !== SuggestionStatus.OPEN) {
    throw new Error('Only open suggestions can be dismissed');
  }

  // Get document version
  const documentVersion = await getDocumentVersionById(suggestion.documentVersionId);
  if (!documentVersion) {
    throw new Error('Document version not found');
  }

  // Get document to find source project
  const document = await getDocumentById(documentVersion.documentId);
  if (!document || !document.sourceProjectId) {
    throw new Error('Document not found or not associated with a source project');
  }

  // Get translation project
  const translationProject = await getTranslationProjectBySourceAndLanguage(
    document.sourceProjectId,
    documentVersion.languageId,
  );

  if (translationProject) {
    // Check if user can translate/edit in this project
    const canTranslate = await canTranslateInProject(user, translationProject.id);
    if (!canTranslate) {
      throw new Error('You do not have permission to dismiss suggestions in this project');
    }
  } else {
    // Fallback: check basic permissions
    if (!isDeployer(user)) {
      throw new Error('You do not have permission to dismiss suggestions');
    }
  }

  // Update suggestion status
  const updated = await updateSuggestionStatus(
    validated.suggestionId,
    SuggestionStatus.DISMISSED,
    validated.dismissedReason,
  );

  await createActivityLog({
    documentVersionId: suggestion.documentVersionId,
    userId: user.id,
    action: 'dismissed_suggestion',
    details: {
      suggestionId: suggestion.id,
      type: suggestion.type,
      startLine: suggestion.startLine ?? null,
      endLine: suggestion.endLine ?? null,
      comment: suggestion.comment ? truncate(suggestion.comment) : null,
    },
  });

  revalidatePath(`/documents/${documentVersion.documentId}/review`);

  return updated;
}

export async function reopenSuggestionAction(input: unknown) {
  const user = await requireUser();
  const validated = reopenSuggestionSchema.parse(input);

  const suggestion = await getSuggestionById(validated.suggestionId);
  if (!suggestion) {
    throw new Error('Suggestion not found');
  }

  if (suggestion.status === SuggestionStatus.OPEN) {
    throw new Error('Suggestion is already open');
  }

  // Get document version to check permissions
  const documentVersion = await getDocumentVersionById(suggestion.documentVersionId);
  if (!documentVersion) {
    throw new Error('Document version not found');
  }

  const document = await getDocumentById(documentVersion.documentId);
  if (!document || !document.sourceProjectId) {
    throw new Error('Document not found or not associated with a source project');
  }

  const translationProject = await getTranslationProjectBySourceAndLanguage(
    document.sourceProjectId,
    documentVersion.languageId,
  );

  if (translationProject) {
    const canReview = await canReviewInProject(user, translationProject.id, validated.suggestionId);
    if (!canReview) {
      // Also allow translators to reopen
      const canTranslate = await canTranslateInProject(user, translationProject.id);
      if (!canTranslate) {
        throw new Error('You do not have permission to reopen suggestions in this project');
      }
    }
  } else {
    if (!isDeployer(user)) {
      throw new Error('You do not have permission to reopen suggestions');
    }
  }

  // If this was an APPLIED CHANGE suggestion with stored originalText, revert the content
  if (
    suggestion.status === SuggestionStatus.APPLIED &&
    suggestion.type === SuggestionType.CHANGE &&
    suggestion.originalText != null &&
    suggestion.proposedText != null
  ) {
    const currentContent = documentVersion.content;
    const revertedContent = currentContent.replace(suggestion.proposedText, suggestion.originalText);

    if (revertedContent !== currentContent) {
      const updatedVersion = await updateDocumentVersion(suggestion.documentVersionId, revertedContent, user.id);

      // Clear originalText and set status to OPEN
      await updateSuggestionStatus(validated.suggestionId, SuggestionStatus.OPEN, null, null);

      await createActivityLog({
        documentVersionId: suggestion.documentVersionId,
        userId: user.id,
        action: 'reopened_suggestion',
        details: {
          suggestionId: suggestion.id,
          type: suggestion.type,
          reverted: true,
        },
      });

      revalidatePath(`/documents/${documentVersion.documentId}/review`);

      return { suggestion: await getSuggestionById(validated.suggestionId), updatedVersion };
    }
  }

  await updateSuggestionStatus(validated.suggestionId, SuggestionStatus.OPEN, null, null);

  await createActivityLog({
    documentVersionId: suggestion.documentVersionId,
    userId: user.id,
    action: 'reopened_suggestion',
    details: {
      suggestionId: suggestion.id,
      type: suggestion.type,
      reverted: false,
    },
  });

  revalidatePath(`/documents/${documentVersion.documentId}/review`);

  return { suggestion: await getSuggestionById(validated.suggestionId) };
}

export async function editSuggestionAction(input: unknown) {
  const user = await requireUser();
  const validated = editSuggestionSchema.parse(input);

  const suggestion = await getSuggestionById(validated.suggestionId);
  if (!suggestion) {
    throw new Error('Suggestion not found');
  }

  if (suggestion.userId !== user.id) {
    throw new Error('Forbidden: You can only edit your own suggestions');
  }

  if (suggestion.status !== SuggestionStatus.OPEN) {
    throw new Error('Only open suggestions can be edited');
  }

  const updated = await updateSuggestionContent(validated.suggestionId, {
    comment: validated.comment ?? '',
    proposedText: validated.proposedText ?? null,
  });

  const documentVersion = await getDocumentVersionById(suggestion.documentVersionId);

  await createActivityLog({
    documentVersionId: suggestion.documentVersionId,
    userId: user.id,
    action: 'edited_suggestion',
    details: {
      suggestionId: suggestion.id,
      comment: validated.comment ? truncate(validated.comment) : null,
    },
  });

  if (documentVersion) {
    revalidatePath(`/documents/${documentVersion.documentId}/review`);
  }

  return updated;
}

export async function deleteSuggestionAction(id: string) {
  const user = await requireUser();

  // Get suggestion
  const suggestion = await getSuggestionById(id);
  if (!suggestion) {
    throw new Error('Suggestion not found');
  }

  // Only the author can delete their suggestion
  if (suggestion.userId !== user.id) {
    throw new Error('Forbidden: You can only delete your own suggestions');
  }

  const documentVersion = await getDocumentVersionById(suggestion.documentVersionId);

  const result = await deleteSuggestion(id);

  await createActivityLog({
    documentVersionId: suggestion.documentVersionId,
    userId: user.id,
    action: 'deleted_suggestion',
    details: {
      suggestionId: id,
      type: suggestion.type,
      startLine: suggestion.startLine ?? null,
      endLine: suggestion.endLine ?? null,
      comment: suggestion.comment ? truncate(suggestion.comment) : null,
    },
  });

  if (documentVersion) {
    revalidatePath(`/documents/${documentVersion.documentId}/review`);
  }

  return result;
}

export async function createSuggestionReplyAction(input: unknown) {
  const user = await requireUser();
  const validated = createSuggestionReplySchema.parse(input);

  // Verify suggestion exists
  const suggestion = await getSuggestionById(validated.suggestionId);
  if (!suggestion) {
    throw new Error('Suggestion not found');
  }

  return await createSuggestionReply({
    suggestionId: validated.suggestionId,
    userId: user.id,
    content: validated.content,
  });
}

export async function deleteSuggestionReplyAction(replyId: string) {
  const user = await requireUser();

  const reply = await getSuggestionReplyById(replyId);
  if (!reply) {
    throw new Error('Reply not found');
  }

  // Only the reply author can delete
  if (reply.userId !== user.id) {
    throw new Error('Forbidden: You can only delete your own replies');
  }

  return await deleteSuggestionReply(replyId);
}

export async function updateSuggestionAction(id: string, input: unknown) {
  const user = await requireUser();
  const validated = updateSuggestionStatusSchema.parse(input);

  // Get suggestion
  const suggestion = await getSuggestionById(id);
  if (!suggestion) {
    throw new Error('Suggestion not found');
  }

  // Only the author can update their suggestion
  if (suggestion.userId !== user.id) {
    throw new Error('Forbidden: You can only edit your own suggestions');
  }

  // Only allow updating OPEN suggestions
  if (suggestion.status !== SuggestionStatus.OPEN) {
    throw new Error('Only open suggestions can be updated');
  }

  return await updateSuggestionStatus(id, validated.status, validated.dismissedReason);
}
