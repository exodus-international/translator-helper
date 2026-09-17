import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyFormattingAction } from './formatting';

/** The document after the action, and what ends up selected. */
function run(text: string, from: number, to: number, action: Parameters<typeof applyFormattingAction>[2]) {
  const result = applyFormattingAction(text, { from, to }, action);
  assert.ok(result, `no result for ${action}`);
  const out = [...text];
  for (const change of [...result.changes].sort((a, b) => b.from - a.from)) {
    out.splice(change.from, change.to - change.from, change.insert);
  }
  return { text: out.join(''), selection: result.selection };
}

describe('formatting actions', () => {
  it('wraps a selection in bold and unwraps it again', () => {
    const first = run('say grace', 4, 9, 'bold');
    assert.equal(first.text, 'say **grace**');
    assert.equal(first.text.slice(first.selection.anchor, first.selection.head), 'grace');

    const second = run(first.text, first.selection.anchor, first.selection.head, 'bold');
    assert.equal(second.text, 'say grace');
  });

  it('unwraps when the markers sit just outside the selection', () => {
    const result = run('say **grace**', 6, 11, 'bold');
    assert.equal(result.text, 'say grace');
  });

  it('inserts the pair with nothing selected', () => {
    const result = run('say ', 4, 4, 'italic');
    assert.equal(result.text, 'say **');
    assert.equal(result.selection.anchor, 5);
  });

  it('strikes through and links with the url selected', () => {
    assert.equal(run('old price', 0, 9, 'strikethrough').text, '~~old price~~');

    const link = run('the description', 4, 15, 'link');
    assert.equal(link.text, 'the [description](url)');
    assert.equal(link.text.slice(link.selection.anchor, link.selection.head), 'url');
  });

  it('sets and clears a heading level', () => {
    const h2 = run('Morning Reflection', 0, 18, 'heading2');
    assert.equal(h2.text, '## Morning Reflection');

    const switched = run(h2.text, 0, 20, 'heading3');
    assert.equal(switched.text, '### Morning Reflection');

    assert.equal(run(switched.text, 0, 23, 'heading3').text, 'Morning Reflection');
  });

  it('toggles bullets across the selected lines', () => {
    const bullets = run('one\ntwo', 0, 7, 'bulletList');
    assert.equal(bullets.text, '* one\n* two');
    assert.equal(run(bullets.text, 0, 11, 'bulletList').text, 'one\ntwo');
  });

  it('numbers a list in order, and renumbers from the top', () => {
    assert.equal(run('one\ntwo\nthree', 0, 13, 'numberedList').text, '1. one\n2. two\n3. three');
    assert.equal(run('- one\n- two', 0, 11, 'numberedList').text, '1. one\n2. two');
  });

  it('quotes lines and leaves the markers alone when clearing', () => {
    assert.equal(run('verse here', 0, 10, 'quote').text, '> verse here');
    assert.equal(run('the **bold** and `code` words', 0, 30, 'clear').text, 'the bold and code words');
  });

  it('tells italic from bold instead of eating one of its markers', () => {
    // `*` is a prefix of `**`, so a test that looked only at the character
    // beside the selection read the inner asterisks of `**grace**` as italic
    // and took one from each side: the bold gone, no italic added.
    assert.equal(run('say **grace**', 6, 11, 'italic').text, 'say ***grace***');
    assert.equal(run('say **grace**', 4, 13, 'italic').text, 'say ***grace***');
  });

  it('adds bold over italic and takes each back off a run of three', () => {
    assert.equal(run('say *grace*', 5, 10, 'bold').text, 'say ***grace***');
    assert.equal(run('say ***grace***', 7, 12, 'italic').text, 'say **grace**');
    assert.equal(run('say ***grace***', 7, 12, 'bold').text, 'say *grace*');
  });

  it('puts the selection back on the words after unwrapping from outside', () => {
    const result = run('say **grace**', 6, 11, 'bold');
    assert.equal(result.text, 'say grace');
    assert.equal(result.text.slice(result.selection.anchor, result.selection.head), 'grace');
  });

  it('leaves an underscore inside a word alone when clearing', () => {
    // `sort_order` is a frontmatter key, not emphasis, and CommonMark does not
    // read an intraword `_` as emphasis either.
    assert.equal(run('the **sort_order** key', 0, 22, 'clear').text, 'the sort_order key');
    assert.equal(run('_really_ snake_case_here', 0, 24, 'clear').text, 'really snake_case_here');
  });

  it('wraps only the selected line when the selection starts mid-line', () => {
    const result = run('intro\nsecond line here\n', 8, 24, 'bulletList');
    assert.equal(result.text, 'intro\n* second line here\n');
  });
});
