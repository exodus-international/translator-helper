'use client';

import { useMemo, useState, type RefObject } from 'react';
import { alignLines } from './align-lines';
import type { CodeEditorHandle } from './code-editor';

/** The same line number, kept within the other document's length. */
export function mapLineNumber(lineNumber: number, _fromTotal: number, toTotal: number): number {
  return Math.min(Math.max(lineNumber, 1), Math.max(toTotal, 1));
}

/**
 * Keeps the two panes level: where the cursor is in each, and which line the
 * other pane is parked on because of it.
 *
 * A translation is written line for line against its source, so a move to a
 * line in one pane marks its counterpart in the other and brings it level.
 * Only a move: a key along the line, or typing, leaves the other pane where it
 * was scrolled to. The chip in each header shows this pane's line and the
 * other's.
 */
export function useCursorSync({
  sourceContent,
  translationContent,
  sourceEditorRef,
  translationEditorRef,
  /** Both panes show editors, side by side: the only time syncing means anything. */
  active,
  /** The translation pane shows an editor at all, whether or not the source does. */
  translationRawVisible,
  /** The source pane shows its editor rather than the preview. */
  sourceRawVisible,
}: {
  sourceContent: string;
  translationContent: string;
  sourceEditorRef: RefObject<CodeEditorHandle | null>;
  translationEditorRef: RefObject<CodeEditorHandle | null>;
  active: boolean;
  translationRawVisible: boolean;
  sourceRawVisible: boolean;
}) {
  const [sourceLine, setSourceLine] = useState(1);
  const [translationLine, setTranslationLine] = useState(1);
  const [syncedSourceLine, setSyncedSourceLine] = useState<number | undefined>(undefined);
  const [syncedTranslationLine, setSyncedTranslationLine] = useState<number | undefined>(undefined);

  const sourceLineCount = useMemo(() => sourceContent.split('\n').length, [sourceContent]);
  const translationLineCount = useMemo(() => translationContent.split('\n').length, [translationContent]);

  const alignPanes = (pane: 'source' | 'translation') => {
    if (!active) return;
    const source = sourceEditorRef.current?.view;
    const translation = translationEditorRef.current?.view;
    if (!source || !translation) return;
    if (pane === 'source') alignLines(source, translation);
    else alignLines(translation, source);
  };

  const handleSourceCursorChange = (lineNumber: number, toLine: boolean) => {
    setSourceLine(lineNumber);
    // Clear stale decoration on the source pane (user is now active here)
    setSyncedSourceLine(undefined);
    if (!translationRawVisible) {
      setSyncedTranslationLine(undefined);
      return;
    }
    // A key moving the cursor along its line, or typing, is not a move to
    // another line: the other pane stays where it was scrolled to, and keeps
    // the line it marks. A click on the line is one, and brings it back.
    if (!toLine) return;

    const translationTargetLine = mapLineNumber(lineNumber, sourceLineCount, translationLineCount);
    setSyncedTranslationLine(translationTargetLine);
    setTranslationLine(translationTargetLine);
    alignPanes('source');
  };

  const handleTranslationCursorChange = (lineNumber: number, toLine: boolean) => {
    setTranslationLine(lineNumber);
    setSyncedTranslationLine(undefined);
    if (!sourceRawVisible) {
      setSyncedSourceLine(undefined);
      return;
    }
    if (!toLine) return;

    const sourceTargetLine = mapLineNumber(lineNumber, translationLineCount, sourceLineCount);
    setSyncedSourceLine(sourceTargetLine);
    setSourceLine(sourceTargetLine);
    alignPanes('translation');
  };

  /** Marks a translation line and its counterpart, as a click on a thread does. */
  const jumpToTranslationLine = (lineNumber: number) => {
    setTranslationLine(lineNumber);
    setSyncedTranslationLine(lineNumber);
    setSyncedSourceLine(mapLineNumber(lineNumber, translationLineCount, sourceLineCount));
  };

  const clearTranslationSync = () => setSyncedTranslationLine(undefined);

  return {
    sourceLine,
    translationLine,
    syncedSourceLine,
    syncedTranslationLine,
    handleSourceCursorChange,
    handleTranslationCursorChange,
    jumpToTranslationLine,
    clearTranslationSync,
  };
}
