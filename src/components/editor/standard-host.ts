'use client';

import type { EditorView } from '@codemirror/view';
import { createContext, useContext } from 'react';
import type { SourceProjectStatus } from '@/generated/prisma/enums';
import type { StandardTranslationEditorEntry } from '@/domain/standard-translation/standard-translation.repository';
import type { StandardPrefill } from './standard-selection-prefill';

/**
 * Kept apart from the provider, which renders the add/edit dialog: the code
 * editor reads this context, and the dialog's own editor imports the code
 * editor, so importing the provider there would be a cycle.
 */

interface StandardTranslationProject {
  id: string;
  name: string;
  status: SourceProjectStatus;
}

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
export interface StandardHost {
  /** The target language; `code` is what the Standard translations page selects it by. */
  language: { id: string; code: string; name: string };
  entries: StandardTranslationEditorEntry[];
  /** The language's projects, for the dialog's scope. */
  projects: StandardTranslationProject[];
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
  /**
   * Opens the dialog on a new entry that starts from text picked out of the
   * document, limited to the document's project; on save the entries are read
   * again.
   */
  addEntry: (prefill: StandardPrefill) => void;
}

export const StandardContext = createContext<StandardHost | null>(null);

export function useStandardHost(): StandardHost | null {
  return useContext(StandardContext);
}
