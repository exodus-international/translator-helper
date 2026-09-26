import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyTextEditAtRange, extractTextAtRange, isRangeWithinBounds } from './text-range';

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
