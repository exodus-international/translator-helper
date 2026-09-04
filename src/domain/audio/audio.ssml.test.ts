import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_PROSODY, escapeXml, renderPause, speechScriptToSsml, validateSsml } from './audio.ssml';

const opts = { voice: 'cs-CZ-AntoninNeural', locale: 'cs-CZ', maxBreakMs: 20_000 };

test('wraps text in speak and voice elements with the given locale and voice', () => {
  const ssml = speechScriptToSsml({ segments: [{ kind: 'text', text: 'Hello.' }] }, opts);
  assert.equal(
    ssml,
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="cs-CZ">' +
      '<voice name="cs-CZ-AntoninNeural"><p>Hello.</p></voice></speak>',
  );
});

test('escapes ampersands, angle brackets and quotes in text', () => {
  const ssml = speechScriptToSsml({ segments: [{ kind: 'text', text: 'Bread & wine <are> "holy"' }] }, opts);
  assert.ok(ssml.includes('<p>Bread &amp; wine &lt;are&gt; &quot;holy&quot;</p>'));
  assert.equal(escapeXml("it's"), 'it&apos;s');
});

test('a 60 second pause at a 20 second ceiling is three chained breaks', () => {
  assert.equal(renderPause(60, 20_000), '<break time="20000ms"/><break time="20000ms"/><break time="20000ms"/>');
});

test('a pause under the ceiling is a single break; a remainder becomes a shorter final break', () => {
  assert.equal(renderPause(5, 20_000), '<break time="5000ms"/>');
  assert.equal(renderPause(25, 20_000), '<break time="20000ms"/><break time="5000ms"/>');
});

test('a zero or negative pause renders nothing', () => {
  assert.equal(renderPause(0, 20_000), '');
  assert.equal(renderPause(-3, 20_000), '');
});

test('segment order is preserved', () => {
  const ssml = speechScriptToSsml(
    {
      segments: [
        { kind: 'text', text: 'One.' },
        { kind: 'pause', seconds: 2 },
        { kind: 'text', text: 'Two.' },
      ],
    },
    opts,
  );
  assert.ok(ssml.includes('<p>One.</p><break time="2000ms"/><p>Two.</p>'));
});

test('paragraphs separated by blank lines become separate p elements', () => {
  const ssml = speechScriptToSsml({ segments: [{ kind: 'text', text: 'First.\n\nSecond.' }] }, opts);
  assert.ok(ssml.includes('<p>First.</p><p>Second.</p>'));
});

test('an empty script still produces well-formed SSML', () => {
  const ssml = speechScriptToSsml({ segments: [] }, opts);
  assert.ok(ssml.startsWith('<speak'));
  assert.ok(ssml.endsWith('<voice name="cs-CZ-AntoninNeural"></voice></speak>'));
});

test('rejects a non-positive break ceiling', () => {
  assert.throws(() => speechScriptToSsml({ segments: [] }, { ...opts, maxBreakMs: 0 }));
});

test('rate and pitch wrap the whole body in one prosody element', () => {
  const ssml = speechScriptToSsml(
    { segments: [{ kind: 'text', text: 'One.' }, { kind: 'pause', seconds: 2 }, { kind: 'text', text: 'Two.' }] },
    { ...opts, rate: '0.8', pitch: '-6%' },
  );
  assert.ok(ssml.includes('<voice name="cs-CZ-AntoninNeural"><prosody rate="0.8" pitch="-6%"><p>One.</p><break time="2000ms"/><p>Two.</p></prosody></voice>'));
});

test('no prosody element is emitted when neither rate nor pitch is given', () => {
  const ssml = speechScriptToSsml({ segments: [{ kind: 'text', text: 'One.' }] }, opts);
  assert.ok(!ssml.includes('<prosody'));
});

test('rate alone yields a prosody element with only a rate attribute', () => {
  const ssml = speechScriptToSsml({ segments: [{ kind: 'text', text: 'One.' }] }, { ...opts, rate: '-20%' });
  assert.ok(ssml.includes('<prosody rate="-20%"><p>One.</p></prosody>'));
});

test('default prosody is the listening-test pick', () => {
  assert.deepEqual(DEFAULT_PROSODY, { rate: '0.8', pitch: '-6%' });
});

// ─── Validation ──────────────────────────────────────────────
//
// Warnings, never refusals: these messages are read by whoever hand-wrote the
// SSML, so the wording is pinned.

test('valid SSML has nothing to complain about', () => {
  const ssml = speechScriptToSsml({ segments: [{ kind: 'text', text: 'Ahoj' }] }, opts);
  assert.deepEqual(validateSsml(ssml), []);
});

test('an unclosed tag is reported with the line it was opened on', () => {
  const problems = validateSsml('<speak>\n  <prosody rate="0.8">Ahoj\n</speak>');
  assert.ok(problems.some((p) => p.message === '<prosody> is never closed.' && p.line === 2));
});

test('a close with no opening is called out on its own line', () => {
  const problems = validateSsml('<speak>\nAhoj</prosody>\n</speak>');
  assert.ok(problems.some((p) => p.message === '</prosody> closes a tag that was never opened.' && p.line === 2));
});

test('a tag the provider does not know is named, not refused', () => {
  const problems = validateSsml('<speak><breakk/></speak>');
  assert.deepEqual(problems, [
    { line: 1, message: '<breakk> is not a tag the speech provider is known to understand.' },
  ]);
});

test('SSML that does not start with speak is called out', () => {
  const problems = validateSsml('<voice name="cs-CZ-AntoninNeural">Ahoj</voice>');
  assert.ok(problems.some((p) => p.message === 'The audio text has to start with a <speak> element.'));
});

test('a bare ampersand is caught, and an escaped one is not', () => {
  const problems = validateSsml('<speak>Petr & Pavel</speak>');
  assert.ok(problems.some((p) => p.message === 'A bare & has to be written as &amp; or the provider cannot read the text.'));
  assert.deepEqual(validateSsml('<speak>Petr &amp; Pavel &#233; &#x41;</speak>'), []);
});

test('an empty box says so rather than listing everything that is missing', () => {
  assert.deepEqual(validateSsml('   '), [
    { line: 1, message: 'The audio text is empty, so there is nothing to say.' },
  ]);
});

test('a self-closing break is not mistaken for something left open', () => {
  assert.deepEqual(validateSsml('<speak>Ahoj<break time="1000ms"/>a jeste jednou</speak>'), []);
});
