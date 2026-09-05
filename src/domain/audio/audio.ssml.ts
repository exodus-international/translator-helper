import type { SpeechScript } from './audio.script';

/**
 * Pure conversion of a speech script into SSML for a given voice.
 *
 * Providers cap the length of a single <break>; a longer pause is expressed
 * as chained breaks that add up to the requested duration. The caller passes
 * the provider's ceiling, so this module knows nothing about vendors.
 */

export interface SsmlOptions {
  /** Provider voice identifier, e.g. `cs-CZ-AntoninNeural`. */
  voice: string;
  /** BCP-47 locale for `xml:lang`, e.g. `cs-CZ`. */
  locale: string;
  /** Longest single <break> the provider honours, in milliseconds. */
  maxBreakMs: number;
  /** Speaking rate as a factor (`0.8` = 20% slower) or a percentage (`-20%`). Omit for the voice default. */
  rate?: string;
  /** Pitch as a percentage (`-6%`). Omit for the voice default. */
  pitch?: string;
}

/**
 * Chosen by ear on real Czech content (Antonín, 2026-08-25): the untuned voice
 * reads too briskly for a reflection. Rate 0.8 with a slightly lower pitch was
 * the pick; volume is left alone so listeners control it on their device.
 */
export const DEFAULT_PROSODY = { rate: '0.8', pitch: '-6%' } as const;

export function speechScriptToSsml(script: SpeechScript, options: SsmlOptions): string {
  if (!(options.maxBreakMs > 0)) {
    throw new Error('maxBreakMs must be a positive number of milliseconds');
  }

  const body = script.segments
    .map((segment) => (segment.kind === 'pause' ? renderPause(segment.seconds, options.maxBreakMs) : renderText(segment.text)))
    .join('');

  // Formatted, not compact: this is what the Audio text tab shows and what a
  // person edits, so the structure has to be visible at a glance. Whitespace
  // between elements is not spoken.
  return formatSsml(
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${escapeXml(options.locale)}">` +
      `<voice name="${escapeXml(options.voice)}">${wrapProsody(body, options)}</voice>` +
      `</speak>`,
  );
}

function wrapProsody(body: string, { rate, pitch }: SsmlOptions): string {
  const attrs = [rate ? ` rate="${escapeXml(rate)}"` : '', pitch ? ` pitch="${escapeXml(pitch)}"` : ''].join('');
  return attrs ? `<prosody${attrs}>${body}</prosody>` : body;
}

/** Splits a pause into as many <break> elements as the ceiling requires. */
export function renderPause(seconds: number, maxBreakMs: number): string {
  let remaining = Math.max(0, Math.round(seconds * 1000));
  let out = '';
  while (remaining > 0) {
    const chunk = Math.min(remaining, maxBreakMs);
    out += `<break time="${chunk}ms"/>`;
    remaining -= chunk;
  }
  return out;
}

/** Each blank-line separated paragraph becomes a <p>, which reads with a natural pause. */
function renderText(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => `<p>${escapeXml(paragraph)}</p>`)
    .join('');
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ─── Validation ──────────────────────────────────────────────

/**
 * Tags Azure's Speech Synthesis Markup Language defines. Anything outside this
 * list is reported, not refused: the list ages as the API grows, and a warning
 * that turns out to be wrong costs a moment's doubt, where a block would cost
 * someone the feature.
 */
const KNOWN_SSML_TAGS = new Set([
  'speak', 'voice', 'prosody', 'break', 'emphasis', 'audio', 'p', 's', 'sub',
  'phoneme', 'lexicon', 'lang', 'say-as', 'mstts:express-as', 'mstts:silence',
  'mstts:backgroundaudio', 'mstts:viseme', 'mstts:audioduration', 'bookmark', 'math',
]);

const VOID_SSML_TAGS = new Set(['break', 'bookmark', 'mstts:silence', 'mstts:viseme', 'mstts:audioduration', 'lexicon']);

export interface SsmlProblem {
  /** 1-indexed line the problem sits on, for pointing at it. */
  line: number;
  message: string;
}

/**
 * Checks hand-written SSML and describes what looks wrong, in words for the
 * person who wrote it. Never throws and never blocks: an SSML the provider
 * rejects fails the generation with the provider's own message, which is a
 * better teacher than a guess made here.
 */
export function validateSsml(ssml: string): SsmlProblem[] {
  const problems: SsmlProblem[] = [];
  const text = ssml.trim();

  if (!text) {
    return [{ line: 1, message: 'The audio text is empty, so there is nothing to say.' }];
  }

  const lineAt = (index: number) => ssml.slice(0, index).split('\n').length;
  const stack: { tag: string; line: number }[] = [];
  let roots = 0;

  const TAG = /<\/?([a-zA-Z][\w:-]*)\b[^>]*?(\/?)>/g;
  let match: RegExpExecArray | null;
  while ((match = TAG.exec(ssml)) !== null) {
    const [raw, rawTag, selfClosing] = match;
    const tag = rawTag.toLowerCase();
    const line = lineAt(match.index);
    const closing = raw.startsWith('</');

    if (!KNOWN_SSML_TAGS.has(tag)) {
      problems.push({ line, message: `<${rawTag}> is not a tag the speech provider is known to understand.` });
    }

    if (closing) {
      const openedAt = stack.findLastIndex((open) => open.tag === tag);
      if (openedAt === -1) {
        problems.push({ line, message: `</${rawTag}> closes a tag that was never opened.` });
        continue;
      }
      // Everything still open inside the tag being closed was forgotten. Saying
      // that is more use than "</speak> closes <prosody>", which describes the
      // symptom at the wrong end of the document.
      for (const forgotten of stack.splice(openedAt + 1).reverse()) {
        problems.push({ line: forgotten.line, message: `<${forgotten.tag}> is never closed.` });
      }
      stack.pop();
      continue;
    }

    if (stack.length === 0 && !selfClosing) roots += 1;
    if (!selfClosing && !VOID_SSML_TAGS.has(tag)) stack.push({ tag, line });
  }

  for (const unclosed of stack.reverse()) {
    problems.push({ line: unclosed.line, message: `<${unclosed.tag}> is never closed.` });
  }

  if (!/^<speak\b/i.test(text)) {
    problems.push({ line: 1, message: 'The audio text has to start with a <speak> element.' });
  } else if (roots > 1) {
    problems.push({ line: 1, message: 'There is more than one top-level element; the provider expects a single <speak>.' });
  }

  // An ampersand that starts no entity is the most common way hand-written
  // SSML stops being XML, and the provider's message for it is cryptic.
  const AMPERSAND = /&(?!#\d+;|#x[0-9a-fA-F]+;|[a-zA-Z][a-zA-Z0-9]*;)/g;
  while ((match = AMPERSAND.exec(ssml)) !== null) {
    problems.push({
      line: lineAt(match.index),
      message: 'A bare & has to be written as &amp; or the provider cannot read the text.',
    });
  }

  return problems.sort((a, b) => a.line - b.line);
}

// ─── Formatting ──────────────────────────────────────────────

/**
 * Elements that stand on their own line. The rest (emphasis, phoneme, say-as,
 * sub, lang, bookmark) live inside a sentence, where a line break would put a
 * space between words that had none and the narrator would hear it.
 */
const BLOCK_SSML_TAGS = new Set([
  'speak', 'voice', 'prosody', 'p', 's', 'break', 'audio', 'lexicon',
  'mstts:express-as', 'mstts:silence', 'mstts:backgroundaudio', 'mstts:audioduration',
]);

type SsmlToken =
  | { kind: 'text'; raw: string }
  | { kind: 'open' | 'close' | 'self' | 'other'; raw: string; tag: string };

/**
 * Indents SSML so its structure is readable, without changing a syllable of
 * what gets spoken.
 *
 * The one rule that keeps it safe: a line break is only ever put between two
 * tags where at least one is block level, and text is never separated from the
 * tags around it. Whitespace between `</p>` and `<break/>` is nothing to a
 * speech engine; whitespace dropped into the middle of a sentence is a pause
 * the writer did not ask for.
 *
 * Tolerant of malformed input on purpose. This runs on hand-edited SSML, and
 * the point of pressing Format on something broken is to see where it broke.
 */
export function formatSsml(ssml: string, indentUnit = '  '): string {
  const tokens = tokenizeSsml(ssml.trim());
  const lines: string[] = [];
  let line = '';
  let depth = 0;

  // The last token actually written. Whitespace that gets dropped must leave
  // the tags on either side of it looking adjacent, or reformatting already
  // formatted SSML would run it all back onto one line.
  let previous: SsmlToken | undefined;

  for (const [index, token] of tokens.entries()) {
    if (token.kind === 'text') {
      // Whitespace between two block tags is ours to lay out again; anywhere
      // else it may be the only thing keeping two words apart.
      if (!token.raw.trim() && breaksBetween(previous, tokens[index + 1])) continue;
      line += token.raw;
      previous = token;
      continue;
    }

    if (token.kind === 'close') depth = Math.max(0, depth - 1);
    if (breaksBetween(previous, token)) {
      lines.push(line);
      line = indentUnit.repeat(depth);
    }
    line += token.raw;
    if (token.kind === 'open') depth += 1;
    previous = token;
  }

  lines.push(line);
  return lines.join('\n');
}

/** True when a line break belongs between these two tokens. */
function breaksBetween(before: SsmlToken | undefined, after: SsmlToken | undefined): boolean {
  if (!before || !after) return false;
  if (before.kind === 'text' || after.kind === 'text') return false;
  // A closing tag follows whatever it wraps. Sending </p> to its own line after
  // an inline element would leave the paragraph ending in stray whitespace.
  if (after.kind === 'close') return isBlockTag(before.tag);
  return isBlockTag(before.tag) || isBlockTag(after.tag);
}

function isBlockTag(tag: string): boolean {
  return BLOCK_SSML_TAGS.has(tag);
}

const SSML_TOKEN = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/?[a-zA-Z][\w:-]*\b[^>]*>/g;

function tokenizeSsml(ssml: string): SsmlToken[] {
  const tokens: SsmlToken[] = [];
  let cursor = 0;
  for (const match of ssml.matchAll(SSML_TOKEN)) {
    if (match.index > cursor) tokens.push({ kind: 'text', raw: ssml.slice(cursor, match.index) });
    cursor = match.index + match[0].length;
    tokens.push(classifyTag(match[0]));
  }
  if (cursor < ssml.length) tokens.push({ kind: 'text', raw: ssml.slice(cursor) });
  return tokens;
}

function classifyTag(raw: string): SsmlToken {
  const name = raw.match(/^<\/?([a-zA-Z][\w:-]*)/);
  if (!name) return { kind: 'other', raw, tag: '' };
  const tag = name[1].toLowerCase();
  if (raw.startsWith('</')) return { kind: 'close', raw, tag };
  // A void element written without the slash still closes itself here; SSML has
  // no <break> to close, and treating it as open would indent the rest.
  if (raw.endsWith('/>') || VOID_SSML_TAGS.has(tag)) return { kind: 'self', raw, tag };
  return { kind: 'open', raw, tag };
}
