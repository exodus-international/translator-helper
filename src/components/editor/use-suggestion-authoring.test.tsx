import assert from 'node:assert/strict';
import test from 'node:test';
import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import type { CodeEditorHandle } from './code-editor';
import { useSuggestionAuthoring } from './use-suggestion-authoring';

/**
 * Writing feedback on a selection, without an editor: the refs stay empty, so
 * the selected text comes from the document and no toolbar is placed, and
 * what is checked is the form, what it submits, and the guard before unsaved
 * work is thrown away.
 */

const CONTENT = 'The call came early.\nNobody answered it.';
const RANGE = { startLine: 1, startColumn: 5, endLine: 1, endColumn: 9 };

function authoring(overrides: Partial<Parameters<typeof useSuggestionAuthoring>[0]> = {}) {
  const created: unknown[] = [];
  const hook = renderHook(
    ({ viewKey }: { viewKey: string }) =>
      useSuggestionAuthoring({
        translationContent: CONTENT,
        editorRef: createRef<CodeEditorHandle | null>(),
        showSelectionToolbar: true,
        formattingEnabled: false,
        documentVersion: 3,
        onCreateSuggestion: (data) => created.push(data),
        viewKey,
        ...overrides,
      }),
    { initialProps: { viewKey: 'review' } },
  );
  return { ...hook, created };
}

test('a selection is read out of the document when no editor can answer', () => {
  const { result } = authoring();
  act(() => result.current.handleSelectionChange(RANGE));
  assert.equal(result.current.selectedText, 'call');
  assert.deepEqual(result.current.selectedRange, RANGE);
  // No editor view, so nothing to place a toolbar over.
  assert.equal(result.current.toolbarPosition, null);
});

test('the form opens on the selection and submits the range, the type and the version', () => {
  const { result, created } = authoring();
  act(() => result.current.handleSelectionChange(RANGE));
  act(() => result.current.openSuggestionForm('CHANGE'));
  assert.equal(result.current.showSuggestionForm, true);
  assert.equal(result.current.suggestionFormType, 'CHANGE');

  act(() => result.current.submitSuggestionForm({ comment: 'Prefer summons.', proposedText: 'summons' }));
  assert.deepEqual(created, [
    { comment: 'Prefer summons.', proposedText: 'summons', type: 'CHANGE', range: RANGE, version: 3 },
  ]);
  assert.equal(result.current.showSuggestionForm, false);
  assert.equal(result.current.selectedRange, null);
});

test('the form cannot open without a selection', () => {
  const { result } = authoring();
  act(() => result.current.openSuggestionForm('COMMENT'));
  assert.equal(result.current.showSuggestionForm, false);
});

test('closing a form nobody has touched just closes it', () => {
  const { result } = authoring();
  act(() => result.current.handleSelectionChange(RANGE));
  act(() => result.current.openSuggestionForm('COMMENT'));
  let confirmed = 0;
  act(() => result.current.requestCloseSuggestionForm(() => (confirmed += 1)));
  assert.equal(result.current.showSuggestionForm, false);
  assert.equal(result.current.discard.open, false);
  assert.equal(confirmed, 1);
});

test('closing a form with unsaved work asks first, and only Discard goes through', () => {
  const { result } = authoring();
  act(() => result.current.handleSelectionChange(RANGE));
  act(() => result.current.openSuggestionForm('COMMENT'));
  result.current.suggestionFormDirtyRef.current = true;

  let confirmed = 0;
  act(() => result.current.requestCloseSuggestionForm(() => (confirmed += 1)));
  assert.equal(result.current.discard.open, true);
  assert.equal(result.current.discard.kind, 'suggestion');
  assert.equal(result.current.showSuggestionForm, true);

  act(() => result.current.discard.onCancel());
  assert.equal(result.current.discard.open, false);
  assert.equal(result.current.showSuggestionForm, true);
  assert.equal(confirmed, 0);

  act(() => result.current.requestCloseSuggestionForm(() => (confirmed += 1)));
  act(() => result.current.discard.onConfirm());
  assert.equal(result.current.showSuggestionForm, false);
  assert.equal(confirmed, 1);
});

test('a new selection while the form is open is a request to leave it', () => {
  const { result } = authoring();
  act(() => result.current.handleSelectionChange(RANGE));
  act(() => result.current.openSuggestionForm('COMMENT'));
  result.current.suggestionFormDirtyRef.current = true;
  act(() => result.current.handleSelectionChange({ ...RANGE, startColumn: 1 }));
  assert.equal(result.current.discard.open, true);
  // The old selection stands until the question is answered.
  assert.deepEqual(result.current.selectedRange, RANGE);
});

test('leaving the Audio text tab with an unsaved draft asks first, and the draft is forgotten on Discard', () => {
  const { result } = authoring();
  let left = 0;
  act(() => result.current.requestLeaveAudioText(() => (left += 1)));
  assert.equal(left, 1);

  result.current.audioDraftDirtyRef.current = true;
  act(() => result.current.requestLeaveAudioText(() => (left += 1)));
  assert.equal(left, 1);
  assert.equal(result.current.discard.kind, 'audioText');
  act(() => result.current.discard.onConfirm());
  assert.equal(left, 2);
  assert.equal(result.current.audioDraftDirtyRef.current, false);
});

test('changing the view throws the selection and the form away', () => {
  const { result, rerender } = authoring();
  act(() => result.current.handleSelectionChange(RANGE));
  act(() => result.current.openSuggestionForm('COMMENT'));
  result.current.suggestionFormDirtyRef.current = true;
  rerender({ viewKey: 'formatted' });
  assert.equal(result.current.showSuggestionForm, false);
  assert.equal(result.current.selectedRange, null);
  assert.equal(result.current.suggestionFormDirtyRef.current, false);
});
