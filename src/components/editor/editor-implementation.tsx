'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { CodeEditor } from './code-editor';

/**
 * Which component draws an editing surface.
 *
 * CodeMirror needs a real browser to mount, so a component test of anything
 * that contains a pane cannot render it. The app never overrides this; a test
 * wraps the tree in the provider with a plain textarea that honours the same
 * props, and everything around the editor runs for real.
 */
export type EditorComponent = typeof CodeEditor;

const EditorImplementationContext = createContext<EditorComponent>(CodeEditor);

export function EditorImplementationProvider({ editor, children }: { editor: EditorComponent; children: ReactNode }) {
  return <EditorImplementationContext.Provider value={editor}>{children}</EditorImplementationContext.Provider>;
}

export function useEditorImplementation(): EditorComponent {
  return useContext(EditorImplementationContext);
}
