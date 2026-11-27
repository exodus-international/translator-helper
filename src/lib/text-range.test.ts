import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTextEditAtRange,
  extractTextAtRange,
  followEdit,
  isRangeWithinBounds,
  offsetsToRange,
  rangeToOffsets,
} from './text-range';

// Three lines, so a range can start, span and end on different lines.
const content = ['The call came early.', 'Nobody answered it.', 'So it came again.'].join('\n');

describe('extractTextAtRange', () => {
  it('reads a word out of one line using 1-based columns', () => {
    const range = { startLine: 1, startColumn: 5, endLine: 1, endColumn: 9 };
    assert.equal(extractTextAtRange(content, range), 'call');
  });

  it('reads from the start of a line when the column is 1', () => {
    const range = { startLine: 2, startColumn: 1, endLine: 2, endColumn: 7 };
    assert.equal(extractTextAtRange(content, range), 'Nobody');
  });

  it('joins the tail of the first line, whole middle lines and the head of the last', () => {
    const range = { startLine: 1, startColumn: 10, endLine: 3, endColumn: 3 };
    assert.equal(extractTextAtRange(content, range), 'came early.\nNobody answered it.\nSo');
  });
});

describe('applyTextEditAtRange', () => {
  it('replaces a word inside one line and leaves the other lines alone', () => {
    const range = { startLine: 1, startColumn: 5, endLine: 1, endColumn: 9 };
    assert.equal(
      applyTextEditAtRange(content, range, 'summons'),
      ['The summons came early.', 'Nobody answered it.', 'So it came again.'].join('\n'),
    );
  });

  it('collapses a multi-line range into one line around the replacement', () => {
    const range = { startLine: 1, startColumn: 10, endLine: 3, endColumn: 3 };
    assert.equal(applyTextEditAtRange(content, range, 'X'), 'The call X it came again.');
  });

  it('inserts when the range is empty', () => {
    const range = { startLine: 2, startColumn: 1, endLine: 2, endColumn: 1 };
    assert.equal(
      applyTextEditAtRange(content, range, 'Still '),
      ['The call came early.', 'Still Nobody answered it.', 'So it came again.'].join('\n'),
    );
  });

  it('accepts a replacement that itself spans lines', () => {
    const range = { startLine: 2, startColumn: 1, endLine: 2, endColumn: 20 };
    assert.equal(
      applyTextEditAtRange(content, range, 'One.\nTwo.'),
      ['The call came early.', 'One.', 'Two.', 'So it came again.'].join('\n'),
    );
  });

  it('puts back what extractTextAtRange took out, so apply and revert agree', () => {
    const range = { startLine: 1, startColumn: 10, endLine: 3, endColumn: 3 };
    const original = extractTextAtRange(content, range);
    const edited = applyTextEditAtRange(content, range, 'X');
    // After the edit the range covers exactly the replacement.
    const revertRange = { startLine: 1, startColumn: 10, endLine: 1, endColumn: 11 };
    assert.equal(extractTextAtRange(edited, revertRange), 'X');
    assert.equal(applyTextEditAtRange(edited, revertRange, original), content);
  });
});

describe('isRangeWithinBounds', () => {
  it('accepts the first and last line of the document', () => {
    assert.equal(isRangeWithinBounds({ startLine: 1, startColumn: 1, endLine: 3, endColumn: 1 }, 3), true);
  });

  it('rejects a start line before the first', () => {
    assert.equal(isRangeWithinBounds({ startLine: 0, startColumn: 1, endLine: 1, endColumn: 1 }, 3), false);
  });

  it('rejects an end line past the last', () => {
    assert.equal(isRangeWithinBounds({ startLine: 1, startColumn: 1, endLine: 4, endColumn: 1 }, 3), false);
  });
});

describe('rangeToOffsets and offsetsToRange', () => {
  const call = { startLine: 1, startColumn: 5, endLine: 1, endColumn: 9 };
  const acrossLines = { startLine: 1, startColumn: 10, endLine: 3, endColumn: 3 };

  it('agree with each other, on one line and across lines', () => {
    for (const range of [call, acrossLines]) {
      const offsets = rangeToOffsets(content, range)!;
      assert.equal(content.slice(offsets.start, offsets.end), extractTextAtRange(content, range));
      assert.deepEqual(offsetsToRange(content, offsets.start, offsets.end), range);
    }
  });

  it('has no offsets for a column past the end of its line, or a line past the text', () => {
    assert.equal(rangeToOffsets('Dawn.', call), null);
    assert.equal(rangeToOffsets(content, { ...call, startLine: 4, endLine: 4 }), null);
  });
});

describe('followEdit', () => {
  const call = { startLine: 1, startColumn: 5, endLine: 1, endColumn: 9 };
  const held = (after: string, range: ReturnType<typeof followEdit>) => range && extractTextAtRange(after, range);

  it('leaves the range alone when the edit is after it', () => {
    const after = content.replace('early', 'late');
    assert.deepEqual(followEdit(content, after, call), call);
  });

  it('moves the range along its line when words are typed before it', () => {
    const after = content.replace('The call', 'The first call');
    assert.equal(held(after, followEdit(content, after, call)), 'call');
  });

  it('moves the range down when a line is added above, and up when one is removed', () => {
    const added = `A new opening line.\n${content}`;
    assert.deepEqual(followEdit(content, added, call), { ...call, startLine: 2, endLine: 2 });
    assert.deepEqual(followEdit(added, content, { ...call, startLine: 2, endLine: 2 }), call);
  });

  it('keeps typing right before or right after the range out of it', () => {
    const before = content.replace('call', 'phone-call');
    assert.equal(held(before, followEdit(content, before, call)), 'call');
    const after = content.replace('call', 'calls');
    assert.equal(held(after, followEdit(content, after, call)), 'call');
  });

  it('grows the range around an edit inside it', () => {
    const after = content.replace('call', 'caXll');
    assert.equal(held(after, followEdit(content, after, call)), 'caXll');
  });

  it('finds the words again when one save changed the text on both sides', () => {
    const after = content.replace('The', 'That first').replace('again', 'once more');
    assert.equal(followEdit(content, after, call), null);
    assert.equal(held(after, followEdit(content, after, call, 'call')), 'call');
  });

  it('takes the occurrence nearest the old place when the words appear more than once', () => {
    const twice = `${content}\nThe call came late.`;
    const after = twice.replace('The', 'That first').replace('late', 'later');
    const range = followEdit(twice, after, call, 'call');
    assert.deepEqual(range, { startLine: 1, startColumn: 12, endLine: 1, endColumn: 16 });
  });

  it('cannot place a range whose words are gone', () => {
    const after = content.replace('The call came', 'A ring was heard');
    assert.equal(followEdit(content, after, call, 'call'), null);
  });
});
