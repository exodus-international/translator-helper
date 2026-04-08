import { createStore } from 'zustand';
import { SuggestionWithUser } from '@/components/monaco-suggestion-decorations';
import {
  updateDocumentVersionAction,
  assignDocumentVersionAction,
  deleteDocumentVersionAction,
} from '@/domain/document-version/document-version.actions';
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
  createDocumentAssignmentAction,
  updateDocumentAssignmentAction,
} from '@/domain/document-assignment/document-assignment.actions';
import { assignReviewerToVersionAction } from '@/domain/document-version/document-version.actions';
import { getProjectReviewersAction, listProjectMembersAction } from '@/domain/project-member/project-member.actions';
import { deleteDocumentAction } from '@/domain/document/document.actions';
import { DocumentStatus, SuggestionType } from '@prisma/client';
import { toast } from 'sonner';

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
  | 'deleteTranslation'
  | 'deleteSource';

export interface MemberInfo {
  id: string;
  userId?: string;
  user: { id: string; name: string | null; email: string };
}

export type DialogState =
  | { type: 'closed' }
  | { type: 'submitReview'; reviewers: MemberInfo[] }
  | { type: 'assignTranslator'; members: MemberInfo[] }
  | { type: 'assignReviewer'; candidates: MemberInfo[] };

export interface EditorStoreConfig {
  documentId: string;
  targetVersion: any | null;
  sourceContent: string;
  initialSuggestions: any[];
  translationProjectId: string | null;
  assignmentId?: string | null;
}

// ─── State ───────────────────────────────────────────────────

interface EditorState {
  // Core
  targetVersion: any | null;
  content: string;
  savedContent: string;
  suggestions: SuggestionWithUser[];
  sourceEditContent: string;

  // Loading & dialogs
  loading: Set<LoadingKey>;
  dialog: DialogState;

  // Config (set once at init)
  documentId: string;
  translationProjectId: string | null;
  assignmentId: string | null;
}

// ─── Actions ─────────────────────────────────────────────────

interface EditorActions {
  // Content
  setContent: (content: string) => void;
  setSourceEditContent: (content: string) => void;

  // Version
  setTargetVersion: (version: any) => void;
  handleStatusChange: (status: DocumentStatus) => void;

  // Save
  saveContent: () => Promise<void>;
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

export function normalizeSuggestions(raw: any[]): SuggestionWithUser[] {
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

  return createStore<EditorStore>()((set, get) => ({
    // ─── Initial state ─────────────────────────────────
    targetVersion: config.targetVersion,
    content: initialContent,
    savedContent: initialContent,
    suggestions: normalizeSuggestions(config.initialSuggestions),
    sourceEditContent: config.sourceContent,
    loading: new Set<LoadingKey>(),
    dialog: { type: 'closed' },
    documentId: config.documentId,
    translationProjectId: config.translationProjectId,
    assignmentId: config.assignmentId ?? null,

    // ─── Content ───────────────────────────────────────
    setContent: (content) => set({ content }),
    setSourceEditContent: (sourceEditContent) => set({ sourceEditContent }),

    // ─── Version ───────────────────────────────────────
    setTargetVersion: (version) => set({ targetVersion: version }),
    handleStatusChange: (status) => {
      const { targetVersion } = get();
      if (targetVersion) {
        set({ targetVersion: { ...targetVersion, status } });
      }
    },

    // ─── Save ──────────────────────────────────────────
    saveContent: async () => {
      const { targetVersion, content } = get();
      if (!targetVersion) return;

      set(addLoading(get(), 'save'));
      try {
        const updated = await updateDocumentVersionAction(targetVersion.id, { content });
        set({
          targetVersion: updated,
          savedContent: content,
          ...removeLoading(get(), 'save'),
        });
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
        toast.success('Comment added!');
        await get().reloadSuggestions();
      } catch (error: any) {
        toast.error(error.message || 'Failed to create comment');
      }
    },

    replySuggestion: async (suggestionId, content) => {
      try {
        await createSuggestionReplyAction({ suggestionId, content });
        await get().reloadSuggestions();
      } catch (error: any) {
        toast.error(error.message || 'Failed to post reply');
      }
    },

    // ─── Dialogs ───────────────────────────────────────
    closeDialog: () => set({ dialog: { type: 'closed' } }),

    openReviewDialog: async () => {
      const { translationProjectId } = get();
      if (!translationProjectId) return;
      try {
        const members = await getProjectReviewersAction(translationProjectId);
        set({ dialog: { type: 'submitReview', reviewers: members } });
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
        toast.success('Submitted for review!');
      } catch (error: any) {
        set(removeLoading(get(), 'submitForReview'));
        toast.error(error.message || 'Failed to submit for review');
      }
    },

    openAssignTranslatorDialog: async () => {
      const { translationProjectId } = get();
      if (!translationProjectId) return;
      try {
        const members = await listProjectMembersAction(translationProjectId);
        const seen = new Map<string, MemberInfo>();
        for (const m of members) {
          if (!seen.has(m.user.id)) seen.set(m.user.id, m);
        }
        set({ dialog: { type: 'assignTranslator', members: Array.from(seen.values()) } });
      } catch (error) {
        toast.error('Failed to load team members');
      }
    },

    assignTranslator: async (userId, deadline?) => {
      const { assignmentId, documentId, translationProjectId, targetVersion } = get();
      if (!translationProjectId) return;

      set(addLoading(get(), 'assignTranslator'));
      try {
        if (assignmentId) {
          await updateDocumentAssignmentAction(assignmentId, {
            userId,
            deadline: deadline ? new Date(deadline) : null,
          });
        } else {
          await createDocumentAssignmentAction({
            documentId,
            translationProjectId,
            userId,
            deadline: deadline ? new Date(deadline) : null,
          });
        }

        // Optimistic update: find the assigned user from dialog members
        const { dialog } = get();
        if (dialog.type === 'assignTranslator') {
          const assignedUser = dialog.members.find((m) => m.user.id === userId)?.user ?? null;
          if (assignedUser && targetVersion) {
            set({ targetVersion: { ...targetVersion, user: assignedUser } });
          }
        }

        set({ dialog: { type: 'closed' }, ...removeLoading(get(), 'assignTranslator') });
        toast.success('Translator assigned!');
      } catch (error: any) {
        set(removeLoading(get(), 'assignTranslator'));
        toast.error(error.message || 'Failed to assign translator');
      }
    },

    unassignTranslator: async () => {
      const { assignmentId, documentId, translationProjectId, targetVersion } = get();
      if (!assignmentId && !translationProjectId) return;
      try {
        if (assignmentId) {
          await updateDocumentAssignmentAction(assignmentId, { userId: null });
        } else {
          await createDocumentAssignmentAction({
            documentId,
            translationProjectId: translationProjectId!,
            userId: null,
          });
        }
        if (targetVersion) {
          set({ targetVersion: { ...targetVersion, user: null } });
        }
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
