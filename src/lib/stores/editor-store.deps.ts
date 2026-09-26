import {
  assignDocumentVersionAction,
  assignReviewerToVersionAction,
  assignTranslatorToVersionAction,
  submitForReviewAction,
  updateDocumentVersionAction,
} from '@/domain/document-version/document-version.actions';
import {
  applySuggestionAction,
  createSuggestionAction,
  createSuggestionReplyAction,
  dismissSuggestionAction,
  getSuggestionsByDocumentVersionAction,
  reopenSuggestionAction,
} from '@/domain/suggestion/suggestion.actions';
import {
  getProjectReviewersAction,
  listTranslationProjectMembersAction,
} from '@/domain/user-language/user-language.actions';
import { deleteDocumentAction } from '@/domain/document/document.actions';
import { translateDocumentAction } from '@/domain/translation/translation.actions';
import { getAudioTranscriptStateAction } from '@/domain/audio/audio.actions';
import { capture } from '@/lib/analytics';
import { toast } from 'sonner';
import type { EditorStoreDeps } from './editor-store';

/**
 * The editor store's dependencies as the app binds them: the real server
 * actions, sonner for toasts and PostHog for analytics.
 *
 * Kept apart from the store so that importing the store pulls in none of
 * this. A test builds the store with fakes instead.
 */
export const editorStoreDeps: EditorStoreDeps = {
  assignDocumentVersion: assignDocumentVersionAction,
  updateDocumentVersion: updateDocumentVersionAction,
  submitForReview: submitForReviewAction,
  assignReviewerToVersion: assignReviewerToVersionAction,
  assignTranslatorToVersion: assignTranslatorToVersionAction,
  applySuggestion: applySuggestionAction,
  createSuggestion: createSuggestionAction,
  createSuggestionReply: createSuggestionReplyAction,
  dismissSuggestion: dismissSuggestionAction,
  getSuggestionsByDocumentVersion: getSuggestionsByDocumentVersionAction,
  reopenSuggestion: reopenSuggestionAction,
  getProjectReviewers: getProjectReviewersAction,
  listTranslationProjectMembers: listTranslationProjectMembersAction,
  deleteDocument: deleteDocumentAction,
  translateDocument: translateDocumentAction,
  getAudioTranscriptState: getAudioTranscriptStateAction,
  notify: {
    success: (message) => toast.success(message),
    error: (message) => toast.error(message),
    warning: (message) => toast.warning(message),
  },
  capture,
};
