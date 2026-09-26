import assert from 'node:assert/strict';
import test from 'node:test';
import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import type { CodeEditorHandle } from './code-editor';
import { mapLineNumber, useCursorSync } from './use-cursor-sync';

/**
 * The line bookkeeping behind the two cursor chips, without an editor: the
 * refs stay empty, so no pane is scrolled, and what is checked is which line
 * each pane reports and which line it marks in the other.
 */

function sync(overrides: Partial<Parameters<typeof useCursorSync>[0]> = {}) {
  return renderHook(() =>
    useCursorSync({
      sourceContent: 'one\ntwo\nthree\nfour\nfive',
      translationContent: 'jedna\ndva\ntri',
      sourceEditorRef: createRef<CodeEditorHandle | null>(),
      translationEditorRef: createRef<CodeEditorHandle | null>(),
      active: true,
      translationRawVisible: true,
      sourceRawVisible: true,
      ...overrides,
    }),
  );
}

test('mapLineNumber keeps a line inside the other document', () => {
  assert.equal(mapLineNumber(3, 5, 3), 3);
  assert.equal(mapLineNumber(5, 5, 3), 3);
  assert.equal(mapLineNumber(0, 5, 3), 1);
  assert.equal(mapLineNumber(2, 5, 0), 1);
});

test('a move to a source line marks the same line in the translation, clamped to its length', () => {
  const { result } = sync();
  act(() => result.current.handleSourceCursorChange(5, true));
  assert.equal(result.current.sourceLine, 5);
  assert.equal(result.current.syncedTranslationLine, 3);
  assert.equal(result.current.translationLine, 3);
});

test('a move along a line leaves the other pane where it was', () => {
  const { result } = sync();
  act(() => result.current.handleTranslationCursorChange(2, true));
  assert.equal(result.current.syncedSourceLine, 2);
  act(() => result.current.handleTranslationCursorChange(2, false));
  assert.equal(result.current.translationLine, 2);
  // Moving in this pane clears its own mark; the other pane keeps its line.
  assert.equal(result.current.syncedTranslationLine, undefined);
  assert.equal(result.current.sourceLine, 2);
});

test('nothing is marked in a pane that is not showing its editor', () => {
  const { result } = sync({ translationRawVisible: false });
  act(() => result.current.handleSourceCursorChange(2, true));
  assert.equal(result.current.sourceLine, 2);
  assert.equal(result.current.syncedTranslationLine, undefined);
});

test('jumping to a thread marks both panes at once', () => {
  const { result } = sync();
  act(() => result.current.jumpToTranslationLine(3));
  assert.equal(result.current.translationLine, 3);
  assert.equal(result.current.syncedTranslationLine, 3);
  assert.equal(result.current.syncedSourceLine, 3);
  act(() => result.current.clearTranslationSync());
  assert.equal(result.current.syncedTranslationLine, undefined);
});
