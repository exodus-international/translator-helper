'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { createEditorStore, type EditorStore, type EditorStoreApi, type EditorStoreConfig } from './editor-store';

const EditorStoreContext = createContext<EditorStoreApi | null>(null);

interface EditorProviderProps extends EditorStoreConfig {
  children: ReactNode;
}

export function EditorProvider({ children, ...config }: EditorProviderProps) {
  // One store per mount, created once: the initialiser runs on the first
  // render only, and later renders reuse the instance.
  const [store] = useState(() => createEditorStore(config));
  return <EditorStoreContext.Provider value={store}>{children}</EditorStoreContext.Provider>;
}

export function useEditorStore<T>(selector: (state: EditorStore) => T): T {
  const store = useContext(EditorStoreContext);
  if (!store) {
    throw new Error('useEditorStore must be used within <EditorProvider>');
  }
  return useStore(store, selector);
}
