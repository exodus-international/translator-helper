import assert from 'node:assert/strict';
import test from 'node:test';
import type { StandardState } from '@/domain/standard-translation/standard-translation.check';
import { applyToText, standardRowDetail, standardRowName, type StandardRowItem } from './standard-check-rows';

function item(
  state: StandardState,
  { kind = 'verbatim' as 'verbatim' | 'term', lines = [1, 1], changedWords = 0, name = null as string | null } = {},
): StandardRowItem {
  return {
    entry: {
      id: 'entry-1',
      name,
      sourceText: 'Sign of the Cross',
      sourceKey: 'sign of the cross',
      targetText: 'znak križa',
      fixedForm: false,
      sourceProjectId: null,
    },
    kind,
    state,
    source: { from: 0, to: 0, firstLine: lines[0], lastLine: lines[1] },
    range: null,
    diff: null,
    changedWords,
    edit: null,
  };
}

test('the detail line says where the entry is and what is wrong with it', () => {
  const cases: [StandardRowItem, string][] = [
    [item('used', { lines: [3, 3] }), 'Line 3 · verbatim'],
    [item('used', { kind: 'term', lines: [5, 5] }), 'Line 5 · term'],
    [item('changed', { lines: [7, 8], changedWords: 1 }), 'Lines 7–8 · 1 word differs'],
    [item('changed', { lines: [7, 7], changedWords: 3 }), 'Line 7 · 3 words differ'],
    [item('changed', { lines: [7, 7], changedWords: 0 }), 'Line 7 · written differently'],
    [item('missing', { lines: [14, 14] }), 'In the source on line 14, not found in the translation'],
    [item('missing', { lines: [7, 8] }), 'In the source on lines 7–8, not found in the translation'],
  ];
  for (const [row, detail] of cases) assert.equal(standardRowDetail(row), detail);
});

test('a term is named by its wording, anything else by its name or source', () => {
  assert.equal(standardRowName(item('used', { kind: 'term', name: 'Sign' })), 'znak križa');
  assert.equal(standardRowName(item('used', { name: 'Sign' })), 'Sign');
  assert.equal(standardRowName(item('used')), 'Sign of the Cross');
});

test('edits made in a string skip text that has changed since', () => {
  const edits = [
    { from: 0, to: 3, insert: 'One', expected: 'one' },
    { from: 4, to: 7, insert: 'Two', expected: 'xxx' },
    { from: 8, to: 13, insert: 'Three', expected: 'three' },
  ];
  assert.deepEqual(applyToText('one two three', edits), { text: 'One two Three', applied: 2 });
});
