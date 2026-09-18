import { createStore } from 'zustand';
import { SuggestionWithUser } from '@/domain/suggestion/suggestion.types';
import { assignDocumentVersionAction } from '@/domain/document-version/document-version.actions';
import { updateDocumentVersionAction } from '@/domain/document-version/document-version.actions';
import { submitForReviewAction } from '@/domain/document-version/document-version.actions';
import {
  applySuggestionAction,
  createSuggestionAction,
  createSuggestionReplyAction,
  dismissSuggestionAction,
  getSuggestionsByDocumentVersionAction,
  reopenSuggestionAction,
} from '@/domain/suggestion/suggestion.actions';

import {
  assignReviewerToVersionAction,
  assignTranslatorToVersionAction,
} from '@/domain/document-version/document-version.actions';
import {
  getProjectReviewersAction,
  listTranslationProjectMembersAction,
} from '@/domain/user-language/user-language.actions';
import { deleteDocumentAction } from '@/domain/document/document.actions';
import { translateDocumentAction } from '@/domain/translation/translation.actions';
import { getAudioTranscriptStateAction } from '@/domain/audio/audio.actions';
import type { AudioTranscriptState } from '@/domain/audio/audio.types';
import { DocumentStatus, SuggestionType } from '@/generated/prisma/enums';
import { toast } from 'sonner';
import { capture } from '@/lib/analytics';

// ─── Types ───────────────────────────────────────────────────

export type LoadingKey =
  | 'save'
  | 'sourceSave'
  | 'applySuggestion'
  | 'dismissSuggestion'
  | 'reopenSuggestion'
  | 'submitForReview'
  | 'assignTranslator'
  | 'assignReviewer'
  | 'startTranslation'
  | 'aiTranslate'
  | 'deleteTranslation'
  | 'deleteSource';

export interface MemberInfo {
  id: string;
  userId?: string;
  user: { id: string; name: string | null; email: string; image?: string | null };
}

export type DialogState =
  | { type: 'closed' }
  | { type: 'submitReview'; reviewers: MemberInfo[] }
  | { type: 'assignTranslator'; members: MemberInfo[]; deadline: Date | string | null }
  | { type: 'assignReviewer'; candidates: MemberInfo[] };

export interface EditorStoreConfig {
  documentId: string;
  /** Title, source language and filename feed the AI translate prompt. */
  documentTitle: string;
  sourceLanguageName: string;
  originalFilename: string | null;
  /** The language this editor page translates into; the first version is created for it. */
  targetLanguageId: string;
  targetVersion: any | null;
  sourceContent: string;
  initialSuggestions: any[];
  translationProjectId: string | null;
  /** Version id when the Audio text tab is reachable here, null when it is not. */
  audioTextVersionId: string | null;
}

// ─── State ───────────────────────────────────────────────────

interface EditorState {
  // Core
  targetVersion: any | null;
  content: string;
  savedContent: string;
  suggestions: SuggestionWithUser[];
  sourceEditContent: string;
  /** When the last successful save landed, manual or auto. */
  lastSavedAt: Date | null;

  // Loading & dialogs
  loading: Set<LoadingKey>;
  dialog: DialogState;

  /**
   * Set when something outside the viewer asks it to show a particular tab —
   * the audio card linking to the Audio text tab. The viewer clears it once it
   * has switched, so it reads as a request rather than a second source of
   * truth for which tab is open.
   */
  requestedTranslationView: 'audio' | null;

  /**
   * Whether this version's transcript is generated or hand-edited. Kept here
   * rather than in the audio card because the card is not the only thing that
   * changes it: saving or resetting in the Audio text tab has to move the
   * badge too, and the two are in different parts of the tree.
   */
  audioTranscriptState: AudioTranscriptState | null;

  /**
   * The Markdown guide is opened from two places that cannot see each other:
   * its button in the header, and the lint tooltip inside CodeMirror — which is
   * plain DOM, not React. One flag in the store keeps them from growing a
   * second way to open it.
   */
  markdownGuideOpen: boolean;

  // Config (set once at init)
  documentId: string;
  targetLanguageId: string;
  translationProjectId: string | null;
  audioTextVersionId: string | null;
}

// ─── Actions ─────────────────────────────────────────────────

interface EditorActions {
  requestTranslationView: (view: 'audio' | null) => void;
  setMarkdownGuideOpen: (open: boolean) => void;

  // Audio transcript
  setAudioTranscriptState: (state: AudioTranscriptState) => void;
  loadAudioTranscriptState: (documentVersionId: string) => Promise<void>;

  // Content
  setContent: (content: string) => void;
  setSourceEditContent: (content: string) => void;

  // Version
  setTargetVersion: (version: any) => void;
  /** Creates this language's first version and opens the editor on it. */
  startTranslation: () => Promise<void>;
  /** Drafts (or re-drafts) the translation with the model, into the editor. */
  translateWithAi: () => Promise<void>;
  handleStatusChange: (status: DocumentStatus) => void;

  // Save
  saveContent: (trigger?: 'manual' | 'auto') => Promise<void>;
  saveSource: (sourceVersionId: string) => Promise<void>;
  deleteSource: () => Promise<void>;

  // Suggestions
  applySuggestion: (suggestionId: string) => Promise<void>;
  dismissSuggestion: (suggestionId: string, reason?: string) => Promise<void>;
  reopenSuggestion: (suggestionId: string) => Promise<void>;
  createSuggestion: (data: {
    comment: string;
    proposedText?: string;
    type: SuggestionType;
    range: { startLine: number; startColumn: number; endLine: number; endColumn: number };
    version: number;
  }) => Promise<void>;
  createGeneralThread: (comment: string) => Promise<void>;
  replySuggestion: (suggestionId: string, content: string) => Promise<void>;
  reloadSuggestions: () => Promise<void>;

  // Dialogs
  openReviewDialog: () => Promise<void>;
  submitForReview: (reviewerId?: string) => Promise<void>;
  openAssignTranslatorDialog: () => Promise<void>;
  assignTranslator: (userId: string, deadline?: string) => Promise<void>;
  unassignTranslator: () => Promise<void>;
  openAssignReviewerDialog: () => Promise<void>;
  assignReviewer: (userId: string) => Promise<void>;
  unassignReviewer: () => Promise<void>;
  closeDialog: () => void;

  // Loading helpers
  isLoading: (key: LoadingKey) => boolean;
  isAnyLoading: () => boolean;

  // Computed
  isDirty: () => boolean;
  saveStatus: () => 'saved' | 'unsaved' | 'saving' | 'error';
}

export type EditorStore = EditorState & EditorActions;

// ─── Helpers ─────────────────────────────────────────────────

function normalizeSuggestions(raw: any[]): SuggestionWithUser[] {
  return raw.map((s) => ({
    ...s,
    createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
    replies: (s.replies || []).map((r: any) => ({
      ...r,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    })),
  }));
}

function addLoading(state: EditorState, key: LoadingKey): Partial<EditorState> {
  const next = new Set(state.loading);
  next.add(key);
  return { loading: next };
}

function removeLoading(state: EditorState, key: LoadingKey): Partial<EditorState> {
  const next = new Set(state.loading);
  next.delete(key);
  return { loading: next };
}

// ─── Store factory ───────────────────────────────────────────

export function createEditorStore(config: EditorStoreConfig) {
  const initialContent = config.targetVersion?.content || '';
  // Both audio cards (the sidebar summary and the details panel) mount at once
  // and both want this. Fetch it for whoever asks first and hand the same
  // promise to the second.
  let transcriptStateRequest: Promise<void> | null = null;

  return createStore<EditorStore>()((set, get) => ({
    // ─── Initial state ─────────────────────────────────
    targetVersion: config.targetVersion,
    content: initialContent,
    savedContent: initialContent,
    lastSavedAt: null,
    suggestions: normalizeSuggestions(config.initialSuggestions),
    sourceEditContent: config.sourceContent,
    loading: new Set<LoadingKey>(),
    dialog: { type: 'closed' },
    requestedTranslationView: null,
    audioTranscriptState: null,
    markdownGuideOpen: false,
    documentId: config.documentId,
    targetLanguageId: config.targetLanguageId,
    translationProjectId: config.translationProjectId,
    audioTextVersionId: config.audioTextVersionId,

    // ─── Content ───────────────────────────────────────
    setContent: (content) => set({ content }),
    setSourceEditContent: (sourceEditContent) => set({ sourceEditContent }),
    setMarkdownGuideOpen: (markdownGuideOpen) => set({ markdownGuideOpen }),

    // ─── Version ───────────────────────────────────────
    setTargetVersion: (version) => set({ targetVersion: version }),

    startTranslation: async () => {
      const { documentId, targetLanguageId } = get();
      if (!targetLanguageId) {
        toast.warning('Please select a target language first');
        return;
      }
      // Two controls offer this, and a disabled attribute only takes effect on
      // the next render: without this the second click of a double-click, or
      // the panel's button racing the header's, sends a second assign for the
      // same document and language.
      if (get().isLoading('startTranslation')) return;

      set(addLoading(get(), 'startTranslation'));
      try {
        const version = await assignDocumentVersionAction({
          documentId,
          languageId: targetLanguageId,
          content: '',
        });
        set({
          targetVersion: version,
          content: version.content ?? '',
          savedContent: version.content ?? '',
          lastSavedAt: null,
          ...removeLoading(get(), 'startTranslation'),
        });
        capture('translation_started');
      } catch (error: any) {
        set(removeLoading(get(), 'startTranslation'));
        toast.error(error.message || 'Failed to start translation');
      }
    },

    translateWithAi: async () => {
      const { targetLanguageId, content } = get();
      if (!targetLanguageId) {
        toast.warning('Select a target language before requesting an AI translation.');
        return;
      }

      set(addLoading(get(), 'aiTranslate'));
      try {
        const result = await translateDocumentAction({
          documentTitle: config.documentTitle,
          sourceLanguageName: config.sourceLanguageName,
          targetLanguageId,
          sourceContent: config.sourceContent,
          currentTranslation: content || undefined,
          originalFilename: config.originalFilename ?? undefined,
        });
        set({ content: result.translatedContent, ...removeLoading(get(), 'aiTranslate') });
        capture('ai_translate_triggered', { overwrite: content.trim().length > 0 });
        toast.success('AI translation generated successfully!');
      } catch (error: any) {
        set(removeLoading(get(), 'aiTranslate'));
        toast.error(error.message || 'Failed to generate AI translation');
      }
    },

    handleStatusChange: (status) => {
      const { targetVersion } = get();
      if (targetVersion) {
        set({ targetVersion: { ...targetVersion, status } });
      }
    },

    // ─── Save ──────────────────────────────────────────
    saveContent: async (trigger = 'manual') => {
      const { targetVersion, content, savedContent } = get();
      if (!targetVersion) return;
      // A save with nothing to write costs a request and a toast for no reason;
      // the save control stays clickable when clean, so this is the guard that
      // makes that honest.
      if (content === savedContent) return;

      set(addLoading(get(), 'save'));
      try {
        const updated = await updateDocumentVersionAction(targetVersion.id, { content });
        set({
          targetVersion: updated,
          savedContent: content,
          lastSavedAt: new Date(),
          ...removeLoading(get(), 'save'),
        });
        // Only track explicit user saves; the 3s-debounced auto-save would
        // otherwise flood analytics with background events.
        if (trigger === 'manual') {
          capture('translation_saved', { documentVersionId: targetVersion.id });
        }
        toast.success('Translation saved successfully!');
      } catch (error: any) {
        set(removeLoading(get(), 'save'));
        toast.error(error.message || 'Failed to save translation');
        throw error;
      }
    },

    saveSource: async (sourceVersionId) => {
      const { sourceEditContent } = get();
      set(addLoading(get(), 'sourceSave'));
      try {
        await updateDocumentVersionAction(sourceVersionId, { content: sourceEditContent });
        set(removeLoading(get(), 'sourceSave'));
        capture('source_saved', { documentVersionId: sourceVersionId });
        toast.success('Source document saved successfully!');
      } catch (error: any) {
        set(removeLoading(get(), 'sourceSave'));
        toast.error(error.message || 'Failed to save source document');
      }
    },

    deleteSource: async () => {
      const { documentId } = get();
      set(addLoading(get(), 'deleteSource'));
      try {
        await deleteDocumentAction(documentId);
        set(removeLoading(get(), 'deleteSource'));
        capture('document_deleted', { location: 'editor' });
        toast.success('Document deleted successfully!');
      } catch (error: any) {
        set(removeLoading(get(), 'deleteSource'));
        toast.error(error.message || 'Failed to delete document');
      }
    },

    // ─── Suggestions ───────────────────────────────────
    reloadSuggestions: async () => {
      const { targetVersion } = get();
      if (!targetVersion) return;
      try {
        const updated = await getSuggestionsByDocumentVersionAction(targetVersion.id);
        set({ suggestions: normalizeSuggestions(updated) });
      } catch (error) {
        console.error('Error loading suggestions:', error);
      }
    },

    applySuggestion: async (suggestionId) => {
      set(addLoading(get(), 'applySuggestion'));
      try {
        const updatedVersion = await applySuggestionAction({ suggestionId });
        set({
          targetVersion: updatedVersion,
          content: updatedVersion.content,
          savedContent: updatedVersion.content,
          ...removeLoading(get(), 'applySuggestion'),
        });
        capture('suggestion_applied', { suggestionId });
        toast.success('Suggestion applied!');
        await get().reloadSuggestions();
      } catch (error: any) {
        set(removeLoading(get(), 'applySuggestion'));
        toast.error(error.message || 'Failed to apply suggestion');
      }
    },

    dismissSuggestion: async (suggestionId, reason?) => {
      set(addLoading(get(), 'dismissSuggestion'));
      try {
        await dismissSuggestionAction({ suggestionId, dismissedReason: reason });
        set(removeLoading(get(), 'dismissSuggestion'));
        capture('suggestion_dismissed', { suggestionId });
        toast.success('Suggestion dismissed!');
        await get().reloadSuggestions();
      } catch (error: any) {
        set(removeLoading(get(), 'dismissSuggestion'));
        toast.error(error.message || 'Failed to dismiss suggestion');
      }
    },

    reopenSuggestion: async (suggestionId) => {
      set(addLoading(get(), 'reopenSuggestion'));
      try {
        const result = await reopenSuggestionAction({ suggestionId });
        if (result.updatedVersion) {
          set({
            targetVersion: result.updatedVersion,
            content: result.updatedVersion.content,
            savedContent: result.updatedVersion.content,
          });
        }
        set(removeLoading(get(), 'reopenSuggestion'));
        capture('suggestion_reopened', { suggestionId });
        toast.success('Suggestion reopened!');
        await get().reloadSuggestions();
      } catch (error: any) {
        set(removeLoading(get(), 'reopenSuggestion'));
        toast.error(error.message || 'Failed to reopen suggestion');
      }
    },

    createSuggestion: async (data) => {
      const { targetVersion } = get();
      if (!targetVersion) return;
      try {
        await createSuggestionAction({
          documentVersionId: targetVersion.id,
          startLine: data.range.startLine,
          startColumn: data.range.startColumn,
          endLine: data.range.endLine,
          endColumn: data.range.endColumn,
          type: data.type,
          comment: data.comment,
          proposedText: data.proposedText,
          version: data.version,
        });
        capture('suggestion_created', { type: data.type });
        toast.success('Suggestion created!');
        await get().reloadSuggestions();
      } catch (error: any) {
        toast.error(error.message || 'Failed to create suggestion');
      }
    },

    createGeneralThread: async (comment) => {
      const { targetVersion } = get();
      if (!targetVersion) return;
      try {
        await createSuggestionAction({
          documentVersionId: targetVersion.id,
          startLine: null,
          startColumn: null,
          endLine: null,
          endColumn: null,
          type: 'COMMENT' as SuggestionType,
          comment,
          version: targetVersion.version ?? 1,
        });
        capture('general_thread_created');
        toast.success('Comment added!');
        await get().reloadSuggestions();
      } catch (error: any) {
        toast.error(error.message || 'Failed to create comment');
      }
    },

    replySuggestion: async (suggestionId, content) => {
      try {
        await createSuggestionReplyAction({ suggestionId, content });
        capture('suggestion_replied', { suggestionId });
        await get().reloadSuggestions();
      } catch (error: any) {
        toast.error(error.message || 'Failed to post reply');
      }
    },

    // ─── Audio transcript ──────────────────────────────
    setAudioTranscriptState: (audioTranscriptState) => set({ audioTranscriptState }),

    loadAudioTranscriptState: (documentVersionId) => {
      transcriptStateRequest ??= getAudioTranscriptStateAction(documentVersionId)
        .then((state) => set({ audioTranscriptState: state }))
        // Nothing here is worth interrupting someone over: the badge just does
        // not appear, and the transcript itself is unaffected.
        .catch(() => set({ audioTranscriptState: 'generated' }));
      return transcriptStateRequest;
    },

    // ─── Dialogs ───────────────────────────────────────
    requestTranslationView: (view) => set({ requestedTranslationView: view }),

    closeDialog: () => set({ dialog: { type: 'closed' } }),

    openReviewDialog: async () => {
      const { translationProjectId } = get();
      if (!translationProjectId) return;
      try {
        const members = await getProjectReviewersAction(translationProjectId);
        set({ dialog: { type: 'submitReview', reviewers: members } });
        capture('dialog_opened', { dialog: 'submit_review' });
      } catch (error) {
        toast.error('Failed to load reviewers');
      }
    },

    submitForReview: async (reviewerId?) => {
      const { targetVersion } = get();
      if (!targetVersion) return;

      set(addLoading(get(), 'submitForReview'));
      try {
        await submitForReviewAction({
          versionId: targetVersion.id,
          ...(reviewerId ? { reviewerId } : {}),
        });
        set({
          dialog: { type: 'closed' },
          targetVersion: { ...targetVersion, status: DocumentStatus.PENDING_REVIEW },
          ...removeLoading(get(), 'submitForReview'),
        });
        capture('submitted_for_review', { has_reviewer: Boolean(reviewerId) });
        toast.success('Submitted for review!');
      } catch (error: any) {
        set(removeLoading(get(), 'submitForReview'));
        toast.error(error.message || 'Failed to submit for review');
      }
    },

    openAssignTranslatorDialog: async () => {
      const { translationProjectId, targetVersion } = get();
      if (!translationProjectId) return;
      try {
        const members = await listTranslationProjectMembersAction(translationProjectId);
        set({ dialog: { type: 'assignTranslator', members, deadline: targetVersion?.deadline ?? null } });
        capture('dialog_opened', { dialog: 'assign_translator' });
      } catch (error) {
        toast.error('Failed to load team members');
      }
    },

    assignTranslator: async (userId, deadline?) => {
      const { documentId, translationProjectId, targetVersion } = get();
      if (!translationProjectId) return;

      set(addLoading(get(), 'assignTranslator'));
      try {
        await assignTranslatorToVersionAction({
          documentId,
          translationProjectId,
          userId,
          deadline: deadline ? new Date(deadline) : null,
        });

        // Optimistic update: find the assigned user from dialog members
        const { dialog } = get();
        if (dialog.type === 'assignTranslator' && targetVersion) {
          const assignedUser = dialog.members.find((m) => m.user.id === userId)?.user ?? null;
          set({
            targetVersion: {
              ...targetVersion,
              ...(assignedUser ? { user: assignedUser } : {}),
              deadline: deadline ? new Date(deadline) : null,
            },
          });
        }

        set({ dialog: { type: 'closed' }, ...removeLoading(get(), 'assignTranslator') });
        capture('translator_assigned');
        toast.success('Translator assigned!');
      } catch (error: any) {
        set(removeLoading(get(), 'assignTranslator'));
        toast.error(error.message || 'Failed to assign translator');
      }
    },

    unassignTranslator: async () => {
      const { documentId, translationProjectId, targetVersion } = get();
      if (!translationProjectId) return;
      try {
        await assignTranslatorToVersionAction({ documentId, translationProjectId, userId: null });
        if (targetVersion) {
          set({ targetVersion: { ...targetVersion, user: null } });
        }
        capture('translator_unassigned');
        toast.success('Translator unassigned');
      } catch (error: any) {
        toast.error(error.message || 'Failed to unassign translator');
      }
    },

    openAssignReviewerDialog: async () => {
      const { translationProjectId } = get();
      if (!translationProjectId) return;
      try {
        const members = await getProjectReviewersAction(translationProjectId);
        set({ dialog: { type: 'assignReviewer', candidates: members } });
        capture('dialog_opened', { dialog: 'assign_reviewer' });
      } catch (error) {
        toast.error('Failed to load reviewers');
      }
    },

    assignReviewer: async (userId) => {
      const { targetVersion, dialog } = get();
      if (!targetVersion) return;

      set(addLoading(get(), 'assignReviewer'));
      try {
        await assignReviewerToVersionAction(targetVersion.id, userId);
        if (dialog.type === 'assignReviewer') {
          const assignedReviewer = dialog.candidates.find((m) => m.user.id === userId)?.user ?? null;
          if (assignedReviewer) {
            set({ targetVersion: { ...targetVersion, reviewer: assignedReviewer } });
          }
        }
        set({ dialog: { type: 'closed' }, ...removeLoading(get(), 'assignReviewer') });
        capture('reviewer_assigned');
        toast.success('Reviewer assigned!');
      } catch (error: any) {
        set(removeLoading(get(), 'assignReviewer'));
        toast.error(error.message || 'Failed to assign reviewer');
      }
    },

    unassignReviewer: async () => {
      const { targetVersion } = get();
      if (!targetVersion) return;
      try {
        await assignReviewerToVersionAction(targetVersion.id, null);
        set({ targetVersion: { ...targetVersion, reviewer: null } });
        capture('reviewer_unassigned');
        toast.success('Reviewer unassigned');
      } catch (error: any) {
        toast.error(error.message || 'Failed to unassign reviewer');
      }
    },

    // ─── Computed helpers ──────────────────────────────
    isLoading: (key) => get().loading.has(key),
    isAnyLoading: () => get().loading.size > 0,
    isDirty: () => get().content !== get().savedContent,
    saveStatus: () => {
      if (get().loading.has('save')) return 'saving';
      if (get().content !== get().savedContent) return 'unsaved';
      return 'saved';
    },
  }));
}

export type EditorStoreApi = ReturnType<typeof createEditorStore>;
