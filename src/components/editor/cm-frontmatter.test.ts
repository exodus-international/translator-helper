import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Text } from '@codemirror/state';
import { closingLine } from './cm-frontmatter';

const doc = (...lines: string[]) => Text.of(lines);

describe('closingLine', () => {
  it('finds the fence that closes a block', () => {
    assert.equal(closingLine(doc('---', 'title: Exodus', 'day: 0', '---', '', '# Chapter one')), 4);
  });

  it('allows trailing whitespace on either fence', () => {
    assert.equal(closingLine(doc('---  ', 'title: Exodus', '--- \t', 'body')), 3);
  });

  it('reads nothing when the document opens on prose', () => {
    assert.equal(closingLine(doc('# Chapter one', '---', 'title: Exodus', '---')), 0);
  });

  it('reads nothing from an unclosed block', () => {
    // The case that mattered: someone types the opening `---` and starts on the
    // keys. Without a closing fence there is no block, and the scan used to run
    // to the end of the document and draw every line of the translation as
    // metadata -- greyed out and small until the second `---` arrived.
    assert.equal(closingLine(doc('---', 'title: Exodus', 'day: 0')), 0);
  });

  it('reads nothing from a horizontal rule on the first line', () => {
    assert.equal(closingLine(doc('---', '', '# Chapter one', '', 'Prose.')), 0);
  });

  it('stops looking past the bound instead of walking the document', () => {
    // A `---` this far down closes nothing: the blocks in this library run to a
    // handful of keys, and the bound is what keeps a keystroke in a long
    // document off every line of it.
    const long = doc('---', ...Array.from({ length: 300 }, (_, i) => `line ${i}`), '---');
    assert.equal(closingLine(long), 0);
  });

  it('takes the first fence, so a rule in the body is not the end of the block', () => {
    assert.equal(closingLine(doc('---', 'title: Exodus', '---', 'Prose.', '---', 'More prose.')), 3);
  });
});
