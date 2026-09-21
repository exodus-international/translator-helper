import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EditorState } from '@codemirror/state';
import { inlineSpansAround } from './cm-inline-spans';
import { markdownSupport } from './cm-markdown';
import { activeFormattingActions, applyFormattingAction, type FormattingAction } from './formatting';

/** The spans the editor's parser finds around a selection, as the toolbar asks for them. */
function spans(text: string, from: number, to: number) {
  return inlineSpansAround(EditorState.create({ doc: text, extensions: markdownSupport }), from, to);
}

/** The document after the action, and what ends up selected. */
function run(text: string, from: number, to: number, action: Parameters<typeof applyFormattingAction>[2]) {
  const result = applyFormattingAction(text, { from, to }, action, spans(text, from, to));
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

  it('leaves the selection on the block after a line action, not past the document', () => {
    // These offsets are dispatched as a selection, so they are read in the
    // document the changes leave behind. When they were not, taking a marker
    // off the last lines put `head` past the end, CodeMirror rejected the whole
    // transaction and the button did nothing; mid-document the selection
    // spilled into the line below and the next click reformatted text nobody
    // had selected.
    const off = run('* one\n* two', 0, 11, 'bulletList');
    assert.equal(off.text, 'one\ntwo');
    assert.equal(off.selection.head, off.text.length);
    assert.equal(off.text.slice(off.selection.anchor, off.selection.head), 'one\ntwo');

    const on = run('one\ntwo', 0, 7, 'bulletList');
    assert.equal(on.text.slice(on.selection.anchor, on.selection.head), '* one\n* two');

    const midDocument = run('* one\n* two\ntail line\n', 0, 11, 'bulletList');
    assert.equal(midDocument.text.slice(midDocument.selection.anchor, midDocument.selection.head), 'one\ntwo');

    for (const [text, action] of [
      ['## Title', 'heading2'],
      ['> quoted', 'quote'],
      ['1. one\n2. two', 'numberedList'],
    ] as const) {
      const result = run(text, 0, text.length, action);
      assert.equal(result.selection.head, result.text.length, `${action} ran past the document`);
    }
  });

  it('wraps only the selected line when the selection starts mid-line', () => {
    const result = run('intro\nsecond line here\n', 8, 24, 'bulletList');
    assert.equal(result.text, 'intro\n* second line here\n');
  });
});

/** What is on for the selection between `«` and `»`, which are not part of the text. */
function activeAt(marked: string) {
  const from = marked.indexOf('«');
  const to = marked.indexOf('»') - 1;
  const text = marked.replace('«', '').replace('»', '');
  return { text, from, to, active: activeFormattingActions(text, { from, to }, spans(text, from, to)) };
}

/** The action run on the selection between `«` and `»`, with the result marked the same way. */
function runAt(marked: string, action: FormattingAction) {
  const { text, from, to } = activeAt(marked);
  const after = run(text, from, to, action);
  const { anchor, head } = after.selection;
  return `${after.text.slice(0, anchor)}«${after.text.slice(anchor, head)}»${after.text.slice(head)}`;
}

describe('link toggle', () => {
  it('takes the link off when its text is selected', () => {
    const result = run('read the [full description](https://exodus90.com/about) first', 10, 26, 'link');
    assert.equal(result.text, 'read the full description first');
    assert.equal(result.text.slice(result.selection.anchor, result.selection.head), 'full description');
  });

  it('takes the link off when the whole link is selected', () => {
    const text = 'see [the page](https://example.org/a_(b)) now';
    const result = run(text, 4, 41, 'link');
    assert.equal(result.text, 'see the page now');
  });

  it('keeps a parenthesis that belongs to the destination', () => {
    const text = '[Foo](https://en.wikipedia.org/wiki/Foo_(bar)) after';
    assert.equal(run(text, 1, 4, 'link').text, 'Foo after');
  });

  it('never unwraps an image', () => {
    const text = '![alt text](https://example.org/a.jpg)';
    assert.equal(run(text, 2, 10, 'link').text, '![[alt text](url)](https://example.org/a.jpg)');
  });
});

describe('taking a span off some of its words', () => {
  it('splits a bold phrase around the selected word', () => {
    assert.equal(
      runAt('say **a «discipline» you commit to** now', 'bold'),
      'say **a** «discipline» **you commit to** now',
    );
  });

  it('drops the marker on a side with no words left', () => {
    assert.equal(runAt('**«a» b c**', 'bold'), '«a» **b c**');
    assert.equal(runAt('**a b «c»**', 'bold'), '**a b** «c»');
    assert.equal(runAt('**Note«:»**', 'bold'), '**Note**«:»');
  });

  it('puts the markers where they still read as markers', () => {
    // `b**, c**` would not reopen bold: the `**` sits between a word and a
    // comma. The comma goes with the selection instead.
    assert.equal(runAt('**a «b», c**', 'bold'), '**a** «b», **c**');
    assert.equal(runAt('**"«Be still»" he said**', 'bold'), '"«Be still»" **he said**');
  });

  it('splits a struck phrase the same way', () => {
    assert.equal(runAt('~~the «old» price~~', 'strikethrough'), '~~the~~ «old» ~~price~~');
    assert.equal(runAt('**~~a «b» c~~**', 'strikethrough'), '**~~a~~ «b» ~~c~~**');
  });

  it('keeps the other layer of a bold italic run', () => {
    assert.equal(runAt('***a «b» c***', 'italic'), '***a* «b» *c***');
    assert.equal(runAt('***a «b» c***', 'bold'), '***a** «b» **c***');
    assert.equal(runAt('*a **«b»** c*', 'italic'), '*a* **«b»** *c*');
  });

  it('splits inside a word only where CommonMark can', () => {
    assert.equal(runAt('**«disc»ipline**', 'bold'), '«disc»**ipline**');
    // An underscore between two letters is not a marker, so the word comes off
    // whole rather than as `disc__ipline__`, which is not bold at all.
    assert.equal(runAt('__«disc»ipline__', 'bold'), '«disc»ipline');
  });

  it('takes a whole link off when some of its words are selected', () => {
    assert.equal(runAt('read [the «full» page](https://example.org) now', 'link'), 'read the «full» page now');
    assert.equal(runAt('read [the «full» page][ref] now', 'link'), 'read the «full» page now');
  });
});

describe('active formatting', () => {
  it('reads bold, italic and strikethrough from outside or inside the selection', () => {
    assert.deepEqual(activeAt('say **«grace»**').active, ['bold']);
    assert.deepEqual(activeAt('say «**grace**»').active, ['bold']);
    assert.deepEqual(activeAt('say *«grace»*').active, ['italic']);
    assert.deepEqual(activeAt('say ~~«grace»~~').active, ['strikethrough']);
  });

  it('tells bold from italic by the length of the run', () => {
    assert.deepEqual(activeAt('say ***«grace»***').active, ['bold', 'italic']);
    assert.deepEqual(activeAt('say «grace»').active, []);
  });

  it('reads a link from its text or the whole link, but not from an image', () => {
    assert.deepEqual(activeAt('see [«the page»](https://example.org)').active, ['link']);
    assert.deepEqual(activeAt('see «[the page](https://example.org)»').active, ['link']);
    assert.deepEqual(activeAt('![«alt»](https://example.org/a.jpg)').active, []);
  });

  it('reads a word inside a longer span, with no markers beside it', () => {
    assert.deepEqual(activeAt('say **a «discipline» you commit to** now').active, ['bold']);
    assert.deepEqual(activeAt('***a «b» c***').active, ['bold', 'italic']);
    assert.deepEqual(activeAt('~~a «struck» word~~').active, ['strikethrough']);
    assert.deepEqual(activeAt('read [the «full» page](https://example.org)').active, ['link']);
    assert.deepEqual(activeAt('read [the «full» page][ref]').active, ['link']);
  });

  it('is not fooled by markers that belong to two other spans', () => {
    // `b` has `**` on both sides, and neither pair is around it.
    assert.deepEqual(activeAt('**a** «b» **c**').active, []);
    // A bracketed phrase with nowhere to go is not a link.
    assert.deepEqual(activeAt('a [«bracketed» phrase] here').active, []);
  });

  it('reads the heading level exactly, from anywhere on the line', () => {
    assert.deepEqual(activeAt('## Morning «Reflection»').active, ['heading2']);
    assert.deepEqual(activeAt('### Morning «Reflection»').active, ['heading3']);
  });

  it('reads a block only when every selected line carries it', () => {
    assert.deepEqual(activeAt('* «one\n* two»').active, ['bulletList']);
    assert.deepEqual(activeAt('«1. one\n2. two»').active, ['numberedList']);
    assert.deepEqual(activeAt('> «verse»').active, ['quote']);
    assert.deepEqual(activeAt('* «one\ntwo»').active, []);
  });

  it('has nothing on for a selection of blank lines', () => {
    assert.deepEqual(activeAt('text\n«\n\n»more').active, []);
  });

  it('shows a button as on exactly when clicking it takes the formatting off', () => {
    // The toolbar lights a button from `activeFormattingActions` and the click
    // runs `applyFormattingAction`. If the two ever read a selection
    // differently, a lit button would add a second layer instead of removing
    // the first -- so every sample is run through both, both ways.
    const toggles: FormattingAction[] = [
      'bold',
      'italic',
      'strikethrough',
      'link',
      'heading1',
      'heading2',
      'heading3',
      'bulletList',
      'numberedList',
      'quote',
    ];
    const samples = [
      'say «grace» now',
      'say **«grace»** now',
      'say «**grace**» now',
      'say *«grace»* now',
      'say ***«grace»*** now',
      'say ~~«grace»~~ now',
      'read [«this»](https://example.org)',
      'read «[this](https://example.org)»',
      '«Morning Reflection»',
      '## «Morning Reflection»',
      '«* one\n* two»',
      '«1. one\n2. two»',
      '> «quoted»',
      'say **a «discipline» you** now',
      '**«a» b c**',
      '**a b «c»**',
      '**a «b», c**',
      '**"«Be still»" he said**',
      '***a «b» c***',
      '*a **«b»** c*',
      '**«disc»ipline**',
      '__«disc»ipline__',
      '~~a «b» c~~',
      '**~~a «b» c~~**',
      'read [the «full» page](https://example.org)',
      'read [the «full» page][ref]',
      'a [«bracketed» phrase] here',
    ];

    for (const sample of samples) {
      const { text, from, to, active } = activeAt(sample);
      for (const action of toggles) {
        const after = run(text, from, to, action);
        let selection = {
          from: Math.min(after.selection.anchor, after.selection.head),
          to: Math.max(after.selection.anchor, after.selection.head),
        };
        // A new link leaves its destination selected, for typing over; it is
        // the words, `[` before them, that now read as a link.
        if (action === 'link' && !active.includes(action)) selection = { from: from + 1, to: to + 1 };
        const nowActive = activeFormattingActions(
          after.text,
          selection,
          spans(after.text, selection.from, selection.to),
        ).includes(action);
        assert.equal(
          nowActive,
          !active.includes(action),
          `${action} on ${JSON.stringify(sample)}: was ${active.includes(action) ? 'on' : 'off'}, still is`,
        );
      }
    }
  });

  it('never lights the commands', () => {
    for (const sample of ['say **«grace»**', '«* one»', 'a<br>«b»']) {
      const { active } = activeAt(sample);
      assert.ok(!active.includes('lineBreak') && !active.includes('clear'));
    }
  });
});
