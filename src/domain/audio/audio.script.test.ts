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
  const script = markdownToSpeechScript('Let us pray.\n\n<!-- pause-duration="60s" -->\n\nAmen.');
  assert.deepEqual(script.segments, [
    { kind: 'text', text: 'Let us pray.' },
    { kind: 'pause', seconds: 60 },
    { kind: 'text', text: 'Amen.' },
  ]);
});

test('pause markers tolerate missing whitespace, mixed case, curly quotes and a bare number', () => {
  const script = markdownToSpeechScript('A<!--pause-duration="5s"-->B <!-- PAUSE-DURATION = “7” --> C');
  assert.deepEqual(textOf(script), ['A', '[pause 5]', 'B', '[pause 7]', 'C']);
});

test('unknown and malformed comments are dropped without throwing', () => {
  const script = markdownToSpeechScript(
    'Before <!-- note to self --> middle <!-- pause-duration="abc" --> after <!-- pause-duration="0s" --> end',
  );
  assert.deepEqual(script.segments, [{ kind: 'text', text: 'Before middle after end' }]);
});

test('a document opening with a heading produces a single text segment, no leading pause', () => {
  const script = markdownToSpeechScript('# Title\n\nOne.\n\nTwo.');
  assert.equal(script.segments.length, 1);
  assert.equal(script.segments[0].kind, 'text');
});

test('a heading mid-document gets a one second pause in front of it', () => {
  const script = markdownToSpeechScript('Intro.\n\n## Next part\n\nMore.');
  assert.deepEqual(script.segments, [
    { kind: 'text', text: 'Intro.' },
    { kind: 'pause', seconds: 1 },
    { kind: 'text', text: 'Next part\n\nMore.' },
  ]);
});

test('consecutive headings each get their own pause', () => {
  const script = markdownToSpeechScript('Intro.\n\n# One\n\n## Two');
  assert.deepEqual(textOf(script), ['Intro.', '[pause 1]', 'One', '[pause 1]', 'Two']);
});

test('an explicit pause marker before a heading does not stack with the heading pause', () => {
  const script = markdownToSpeechScript('Slovo.\n\n<!-- pause-duration="30s" -->\n\n# Modlitba\n\nAmen.');
  assert.deepEqual(textOf(script), ['Slovo.', '[pause 30]', 'Modlitba\n\nAmen.']);
});

test('a hash without a following space is not a heading and gets no pause', () => {
  const script = markdownToSpeechScript('Viz #108 a\n#hashtag na řádku.');
  assert.equal(script.segments.length, 1);
});

test('adjacent and leading pauses are preserved in order', () => {
  const script = markdownToSpeechScript('<!-- pause-duration="3s" --><!-- pause-duration="4s" -->Then words.');
  assert.deepEqual(textOf(script), ['[pause 3]', '[pause 4]', 'Then words.']);
});

test('elements marked data-read="false" are skipped, content included', () => {
  const md = 'Čti nahlas.<div data-read="false">Jen na obrazovku.<div>vnořené</div>ještě skryté</div>A dál.';
  assert.equal(markdownToPlainText(md), 'Čti nahlas.\nA dál.');
});

test('a pause marker inside a data-read="false" element does not fire', () => {
  const script = markdownToSpeechScript('Slovo.<section data-read="false">skip<!-- pause-duration="60s" --></section>Konec.');
  assert.deepEqual(script.segments, [{ kind: 'text', text: 'Slovo.\nKonec.' }]);
});

test('data-read="false" on a void or self-closing tag leaves a space, not a break', () => {
  assert.equal(markdownToPlainText('Před <img src="x.png" data-read="false"> po <span data-read="false" /> konec'), 'Před po konec');
});

test('an unclosed data-read="false" element skips to the end of the input', () => {
  assert.equal(markdownToPlainText('Slyšet.<div data-read="false">už nikdy nic'), 'Slyšet.');
});

test('data-read="true" and unquoted or curly-quoted false are handled', () => {
  assert.equal(markdownToPlainText('<p data-read="true">Ano.</p><p data-read=false>Ne.</p><p data-read=“false”>Také ne.</p>'), 'Ano.');
});

test('empty input yields an empty script', () => {
  assert.deepEqual(markdownToSpeechScript(''), { segments: [] });
  assert.deepEqual(markdownToSpeechScript('---\ntitle: x\n---\n'), { segments: [] });
});

test('runs of blank lines collapse to a single paragraph break', () => {
  assert.equal(markdownToPlainText('A\n\n\n\n\nB'), 'A\n\nB');
});

test('inline HTML keeps its text, block tags and br separate lines, script and style are dropped whole', () => {
  const md = 'Svíce <strong>Pokoje</strong>.<br>Druhý řádek <img src="x.png" alt="obrázek"> konec.<div>Uvnitř</div><script>alert(1)</script><style>p{}</style>Amen.';
  assert.equal(markdownToPlainText(md), 'Svíce Pokoje.\nDruhý řádek konec.\nUvnitř\nAmen.');
});

test('literal angle brackets and ampersands in prose survive stripping (the SSML builder escapes them)', () => {
  assert.equal(markdownToPlainText('2 < 3 a Tom & Jerry'), '2 < 3 a Tom & Jerry');
});

test('a pause marker survives a word joiner pasted into it', () => {
  // U+2060 lands here when the marker is copied through Word, Docs or chat.
  const script = markdownToSpeechScript(`A.\n\n<!-- \u2060pause-duration="10s" -->\n\nB.`);
  assert.deepEqual(script.segments, [
    { kind: 'text', text: 'A.' },
    { kind: 'pause', seconds: 10 },
    { kind: 'text', text: 'B.' },
  ]);
});

test('a pause marker survives a zero-width space inside the duration', () => {
  const script = markdownToSpeechScript(`A.\n\n<!-- pause-duration="1\u200b0s" -->\n\nB.`);
  assert.equal(script.segments[1] && script.segments[1].kind === 'pause' && script.segments[1].seconds, 10);
});

test('invisible characters never reach the narrator', () => {
  const md = 'Sv\u00adíce' + '\ufeff' + ' Pokoje\u200d.';
  assert.equal(markdownToPlainText(md), 'Svíce Pokoje.');
});

test('an unread inline element leaves the sentence running on', () => {
  // A line break here makes the narrator hitch mid-sentence.
  const md = 'Dnes vstupujeme do <b data-read="false">svateho</b> postniho obdobi.';
  assert.equal(markdownToPlainText(md), 'Dnes vstupujeme do postniho obdobi.');
});

test('an unread block element still breaks the line', () => {
  const md = 'Prvni.<div data-read="false">skryte</div>Druhy.';
  assert.equal(markdownToPlainText(md), 'Prvni.\nDruhy.');
});
