import assert from 'node:assert/strict';
import test from 'node:test';
import { describeRemovedLayout } from './layout-notice';

test('nothing removed says nothing', () => {
  assert.equal(describeRemovedLayout([]), null);
});

test('the Glory Be names each part it lost, in one sentence', () => {
  assert.equal(
    describeRemovedLayout(['blockquote', 'emphasis', 'comment']),
    'Blockquote markers, the emphasis around the text and comments such as the pause marker were left out. Each document keeps its own layout; only the wording is saved.',
  );
});

test('a single part reads in the singular when it is one thing', () => {
  assert.equal(
    describeRemovedLayout(['indentation']),
    'Indentation was left out. Each document keeps its own layout; only the wording is saved.',
  );
});
