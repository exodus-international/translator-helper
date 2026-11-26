'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import {
  createEditorStore,
  type EditorStore,
  type EditorStoreApi,
  type EditorStoreConfig,
  type EditorStoreDeps,
} from './editor-store';
import { editorStoreDeps } from './editor-store.deps';

const EditorStoreContext = createContext<EditorStoreApi | null>(null);

interface EditorProviderProps extends EditorStoreConfig {
  children: ReactNode;
  /** The store's outside world; the app leaves it at the real one, a test hands in fakes. */
  deps?: EditorStoreDeps;
}

export function EditorProvider({ children, deps = editorStoreDeps, ...config }: EditorProviderProps) {
  // One store per mount, created once: the initialiser runs on the first
  // render only, and later renders reuse the instance.
  const [store] = useState(() => createEditorStore(config, deps));
  return <EditorStoreContext.Provider value={store}>{children}</EditorStoreContext.Provider>;
}

export function useEditorStore<T>(selector: (state: EditorStore) => T): T {
  const store = useContext(EditorStoreContext);
  if (!store) {
    throw new Error('useEditorStore must be used within <EditorProvider>');
  }
  return useStore(store, selector);
}

/**
 * The editor's store, or null outside an editor: for a control that renders in
 * the editor's sidebar and elsewhere, and reads or moves the version's status
 * where there is an editor to tell.
 */
export function useEditorStoreApi(): EditorStoreApi | null {
  return useContext(EditorStoreContext);
}
