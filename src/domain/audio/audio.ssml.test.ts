import assert from 'node:assert/strict';
import test from 'node:test';
import { escapeXml, renderPause, speechScriptToSsml } from './audio.ssml';

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
