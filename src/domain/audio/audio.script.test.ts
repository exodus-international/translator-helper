import assert from 'node:assert/strict';
import test from 'node:test';
import { markdownToPlainText, markdownToSpeechScript } from './audio.script';

const textOf = (script: ReturnType<typeof markdownToSpeechScript>) =>
  script.segments.map((s) => (s.kind === 'text' ? s.text : `[pause ${s.seconds}]`));

test('frontmatter is removed and never read aloud', () => {
  const script = markdownToSpeechScript(`---\ntitle: Day 1\nlabels: [a, b]\n---\n\n# Day 1\n\nCome, follow me.`);
  assert.deepEqual(textOf(script), ['Day 1\n\nCome, follow me.']);
});

test('content without frontmatter passes through unchanged apart from syntax', () => {
  const script = markdownToSpeechScript('Just prose.\n\nSecond paragraph.');
  assert.deepEqual(textOf(script), ['Just prose.\n\nSecond paragraph.']);
});

test('headings, emphasis, links, inline code and fences are stripped while prose survives', () => {
  const md = [
    '## Morning Reflection',
    '',
    'This is **bold** and *italic* and _also italic_ and `code`.',
    'See [the Gospel](https://example.com/gospel) and ![icon](img.png).',
    '',
    '```',
    'inside fence',
    '```',
    '',
    '---',
    '',
    '- first bullet',
    '- second bullet',
    '1. numbered stays numbered',
  ].join('\n');
  assert.equal(
    markdownToPlainText(md),
    [
      'Morning Reflection',
      '',
      'This is bold and italic and also italic and code.',
      'See the Gospel and icon.',
      '',
      'inside fence',
      '',
      'first bullet',
      'second bullet',
      '1. numbered stays numbered',
    ].join('\n'),
  );
});

test('blockquoted scripture keeps its text', () => {
  const md = '> The Lord is my shepherd; I shall not want.\n> He restores my soul.\n> — Psalm 23:1-3';
  assert.equal(markdownToPlainText(md), 'The Lord is my shepherd; I shall not want.\nHe restores my soul.\n— Psalm 23:1-3');
});

test('a pause marker becomes a pause segment between text segments', () => {
  const script = markdownToSpeechScript('Let us pray.\n\n<!-- pause: 60 -->\n\nAmen.');
  assert.deepEqual(script.segments, [
    { kind: 'text', text: 'Let us pray.' },
    { kind: 'pause', seconds: 60 },
    { kind: 'text', text: 'Amen.' },
  ]);
});

test('pause markers tolerate missing whitespace and mixed case', () => {
  const script = markdownToSpeechScript('A<!--pause:5-->B <!-- PAUSE : 7 --> C');
  assert.deepEqual(textOf(script), ['A', '[pause 5]', 'B', '[pause 7]', 'C']);
});

test('unknown and malformed comments are dropped without throwing', () => {
  const script = markdownToSpeechScript('Before <!-- note to self --> middle <!-- pause: abc --> after <!-- pause: 0 --> end');
  assert.deepEqual(script.segments, [{ kind: 'text', text: 'Before  middle  after  end' }]);
});

test('a document with no markers produces a single text segment', () => {
  const script = markdownToSpeechScript('# Title\n\nOne.\n\nTwo.');
  assert.equal(script.segments.length, 1);
  assert.equal(script.segments[0].kind, 'text');
});

test('adjacent and leading pauses are preserved in order', () => {
  const script = markdownToSpeechScript('<!-- pause: 3 --><!-- pause: 4 -->Then words.');
  assert.deepEqual(textOf(script), ['[pause 3]', '[pause 4]', 'Then words.']);
});

test('empty input yields an empty script', () => {
  assert.deepEqual(markdownToSpeechScript(''), { segments: [] });
  assert.deepEqual(markdownToSpeechScript('---\ntitle: x\n---\n'), { segments: [] });
});

test('runs of blank lines collapse to a single paragraph break', () => {
  assert.equal(markdownToPlainText('A\n\n\n\n\nB'), 'A\n\nB');
});
