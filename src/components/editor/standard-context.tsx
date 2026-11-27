'use client';

/**
 * Loads a document's standard translations and provides them to its editor
 * (see `standard-host.ts`), owning the add/edit dialog the tools open.
 */

import type { EditorView } from '@codemirror/view';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { StandardTranslationDialog } from '@/components/standard-translation-dialog';
import { getStandardTranslationsForDocumentAction } from '@/domain/standard-translation/standard-translation.actions';
import type { StandardTranslationEditorEntry } from '@/domain/standard-translation/standard-translation.repository';
import { StandardContext, type StandardHost } from './standard-host';
import type { StandardPrefill } from './standard-selection-prefill';

type Loaded = Awaited<ReturnType<typeof getStandardTranslationsForDocumentAction>>;

/** What the provider's dialog is open on, if anything. */
type DialogState = { entry: StandardTranslationEditorEntry } | { prefill: StandardPrefill } | null;

export function StandardProvider({
  documentId,
  language,
  sourceContent,
  editable = true,
  requestEditor,
  load = getStandardTranslationsForDocumentAction,
  children,
}: {
  documentId: string;
  /** The target language; nothing is loaded without one. */
  language: { id: string; code: string; name: string } | null;
  sourceContent: string;
  editable?: boolean;
  /** Brings the translation editor on screen, for a tool used from Preview. */
  requestEditor?: () => void;
  /** The action that reads the entries, replaceable so a test can provide them. */
  load?: typeof getStandardTranslationsForDocumentAction;
  children: ReactNode;
}) {
  const [loaded, setLoaded] = useState<{ key: string; data: Loaded | null }>();
  const [view, setView] = useState<EditorView | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [attempt, setAttempt] = useState(0);
  const [reportedEditable, reportEditable] = useState<boolean>();
  const canEdit = reportedEditable ?? editable;
  const languageId = language?.id ?? '';
  // Re-reading after an edit keeps the entries on screen until the new ones arrive.
  const key = `${documentId}\u0000${languageId}`;

  useEffect(() => {
    if (!languageId) return;
    let cancelled = false;
    load({ documentId, languageId }).then(
      // Null for someone outside the language's team: no tools.
      (data) => !cancelled && setLoaded({ key, data }),
      (error) => {
        if (cancelled) return;
        console.error('Standard translations could not be read', error);
        // A re-read that fails keeps the entries already on screen; a first read leaves the editor without the tools.
        setLoaded((current) => (current?.key === key && current.data ? current : { key, data: null }));
        if (attempt > 0) toast.error('The standard translations could not be refreshed; reload the page to see the latest.');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [documentId, languageId, key, attempt, load]);

  const data = loaded?.key === key ? loaded.data : null;

  const editEntry = useCallback((entry: StandardTranslationEditorEntry) => setDialog({ entry }), []);
  const addEntry = useCallback((prefill: StandardPrefill) => setDialog({ prefill }), []);

  const registerView = useCallback((next: EditorView) => {
    setView(next);
    return () => setView((current) => (current === next ? null : current));
  }, []);

  const value = useMemo<StandardHost | null>(
    () =>
      language && data
        ? {
            language,
            entries: data.entries,
            projects: data.projects,
            sourceProjectId: data.sourceProjectId,
            sourceContent,
            view,
            registerView,
            editable: canEdit,
            requestEditor,
            reportEditable,
            editEntry,
            addEntry,
          }
        : null,
    [language, data, sourceContent, view, registerView, canEdit, requestEditor, editEntry, addEntry],
  );

  if (!value) return <>{children}</>;
  const prefill = dialog && 'prefill' in dialog ? dialog.prefill : null;
  const editing = dialog && 'entry' in dialog ? dialog.entry : null;
  // From a document the choice is the design's: all projects (where an entry
  // starts) or this document's project, plus the project an edited entry
  // already belongs to.
  const offered = value.projects.filter(
    (project) => project.id === value.sourceProjectId || project.id === editing?.sourceProjectId,
  );
  return (
    <StandardContext.Provider value={value}>
      {children}
      <StandardTranslationDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        language={value.language}
        projects={offered}
        entry={editing}
        initial={prefill ? { ...prefill, sourceProjectId: null } : undefined}
        hint={prefill?.hint}
        onSaved={() => {
          setDialog(null);
          setAttempt((n) => n + 1);
        }}
      />
    </StandardContext.Provider>
  );
}
