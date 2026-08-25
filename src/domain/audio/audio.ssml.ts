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

  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${escapeXml(options.locale)}">` +
    `<voice name="${escapeXml(options.voice)}">${wrapProsody(body, options)}</voice>` +
    `</speak>`
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
