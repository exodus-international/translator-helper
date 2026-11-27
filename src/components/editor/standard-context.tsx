'use client';

import type { EditorView } from '@codemirror/view';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StandardTranslationDialog } from '@/components/standard-translation-dialog';
import { getStandardTranslationsForDocumentAction } from '@/domain/standard-translation/standard-translation.actions';
import type { StandardTranslationEditorEntry } from '@/domain/standard-translation/standard-translation.repository';

/**
 * What the standard translation tools in a translation editor share: the
 * entries the document can use (the language's general ones and its project's,
 * the same ones AI translation uses), the source they are found in, and the
 * translation's editor view, through which every change is made so it is
 * undoable and marks the document unsaved like typing does.
 *
 * The entries are the language team's: someone outside it, who may still open
 * the editor, gets none, and the editor and panel then show nothing extra.
 * Without a provider there are no standard translation tools at all.
 */
type Loaded = Awaited<ReturnType<typeof getStandardTranslationsForDocumentAction>>;

export interface StandardHost {
  language: { id: string; name: string };
  entries: StandardTranslationEditorEntry[];
  /** The language's projects, for the dialog's scope. */
  projects: Loaded['projects'];
  /** The document's project, or null when it has none. */
  sourceProjectId: string | null;
  sourceContent: string;
  view: EditorView | null;
  registerView: (view: EditorView) => () => void;
  /** Whether the translation can be changed here: false in a review that can no longer be edited. */
  editable: boolean;
  /** The editor's live answer to `editable`, as the version's status moves while the page is open. */
  reportEditable: (editable: boolean) => void;
  /** Opens the dialog on an entry; on save the entries are read again. */
  editEntry: (entry: StandardTranslationEditorEntry) => void;
}

const StandardContext = createContext<StandardHost | null>(null);

export function useStandardHost(): StandardHost | null {
  return useContext(StandardContext);
}

export function StandardProvider({
  documentId,
  language,
  sourceContent,
  editable = true,
  children,
}: {
  documentId: string;
  /** The target language; nothing is loaded without one. */
  language: { id: string; name: string } | null;
  sourceContent: string;
  editable?: boolean;
  children: ReactNode;
}) {
  const [loaded, setLoaded] = useState<{ key: string; data: Loaded | null }>();
  const [view, setView] = useState<EditorView | null>(null);
  const [editing, setEditing] = useState<StandardTranslationEditorEntry | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [reportedEditable, reportEditable] = useState<boolean>();
  const canEdit = reportedEditable ?? editable;
  const languageId = language?.id ?? '';
  // Re-reading after an edit keeps the entries on screen until the new ones arrive.
  const key = `${documentId}\u0000${languageId}`;

  useEffect(() => {
    if (!languageId) return;
    let cancelled = false;
    getStandardTranslationsForDocumentAction({ documentId, languageId }).then(
      (data) => !cancelled && setLoaded({ key, data }),
      // Not on the language's team, or the entries could not be read: no tools, rather than an error over the editor.
      () => !cancelled && setLoaded({ key, data: null }),
    );
    return () => {
      cancelled = true;
    };
  }, [documentId, languageId, key, attempt]);

  const data = loaded?.key === key ? loaded.data : null;

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
            reportEditable,
            editEntry: setEditing,
          }
        : null,
    [language, data, sourceContent, view, registerView, canEdit],
  );

  if (!value) return <>{children}</>;
  return (
    <StandardContext.Provider value={value}>
      {children}
      <StandardTranslationDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        language={value.language}
        projects={value.projects}
        entry={editing}
        onSaved={() => {
          setEditing(null);
          setAttempt((n) => n + 1);
        }}
      />
    </StandardContext.Provider>
  );
}
