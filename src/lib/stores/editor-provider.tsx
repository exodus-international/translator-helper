'use client';

import { createContext, useContext, useRef, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { createEditorStore, type EditorStore, type EditorStoreApi, type EditorStoreConfig } from './editor-store';

const EditorStoreContext = createContext<EditorStoreApi | null>(null);

interface EditorProviderProps extends EditorStoreConfig {
  children: ReactNode;
}

export function EditorProvider({ children, ...config }: EditorProviderProps) {
  const storeRef = useRef<EditorStoreApi>(null);
  if (!storeRef.current) {
    storeRef.current = createEditorStore(config);
  }
  return <EditorStoreContext.Provider value={storeRef.current}>{children}</EditorStoreContext.Provider>;
}

export function useEditorStore<T>(selector: (state: EditorStore) => T): T {
  const store = useContext(EditorStoreContext);
  if (!store) {
    throw new Error('useEditorStore must be used within <EditorProvider>');
  }
  return useStore(store, selector);
}
