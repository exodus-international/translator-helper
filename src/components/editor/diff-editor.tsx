'use client';

/**
 * Side-by-side diff for the suggestion diff
 * viewer: a read-only side-by-side merge view.
 */

import { cn } from '@/lib/utils';
import { MergeView } from '@codemirror/merge';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { useEffect, useRef } from 'react';
import { editorTheme } from './cm-theme';

export interface DiffEditorProps {
  original: string;
  modified: string;
  className?: string;
}

export function DiffEditor({ original, modified, className }: DiffEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hostRef.current) return;

    const shared = [lineNumbers(), markdown(), EditorView.lineWrapping, EditorState.readOnly.of(true), editorTheme];

    const view = new MergeView({
      a: { doc: original, extensions: shared },
      b: { doc: modified, extensions: shared },
      parent: hostRef.current,
      revertControls: undefined, // read-only: nothing to revert
      highlightChanges: true,
      gutter: true,
    });

    return () => view.destroy();
  }, [original, modified]);

  return <div ref={hostRef} className={cn('cm-diff border rounded-md overflow-auto h-full', className)} />;
}
