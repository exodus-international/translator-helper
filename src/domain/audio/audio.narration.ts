import { AudioQuality } from '@/generated/prisma/enums';
import { DEFAULT_PROSODY } from './audio.ssml';

/**
 * How a language is narrated: what an admin stored for it, filled in with the
 * app defaults. Everything that derives SSML reads the profile from here and
 * never the raw columns, so "empty means the default" is decided in one place.
 *
 * Pure, and safe to import into the browser: the settings form shows the
 * defaults as placeholders.
 */

/** The narration columns as stored on a language. Null is "use the default". */
export interface NarrationSettings {
  audioRate?: string | null;
  audioPitch?: string | null;
  audioSentencePauseMs?: number | null;
  audioCommaPauseMs?: number | null;
  audioQuality?: AudioQuality | null;
}

export interface NarrationProfile {
  /** Speaking rate as a factor, `0.8` being 20% slower than the voice's own pace. */
  rate: string;
  /** Pitch as a percentage, `-6%` being slightly lower. */
  pitch: string;
  /** Silence after every sentence in milliseconds, or null for the voice's own. */
  sentencePauseMs: number | null;
  /** Silence after every comma in milliseconds, or null for the voice's own. */
  commaPauseMs: number | null;
}

/**
 * The pauses default to null, not to a number: no pause setting means the
 * voice's own timing and no `mstts` markup at all, which is what every
 * language had before pauses could be set.
 */
export const DEFAULT_NARRATION: NarrationProfile = { ...DEFAULT_PROSODY, sentencePauseMs: null, commaPauseMs: null };

export function narrationProfile(settings: NarrationSettings): NarrationProfile {
  return {
    rate: settings.audioRate?.trim() || DEFAULT_NARRATION.rate,
    pitch: settings.audioPitch?.trim() || DEFAULT_NARRATION.pitch,
    sentencePauseMs: settings.audioSentencePauseMs ?? DEFAULT_NARRATION.sentencePauseMs,
    commaPauseMs: settings.audioCommaPauseMs ?? DEFAULT_NARRATION.commaPauseMs,
  };
}

/**
 * Quality is not narration and never reaches the SSML, so it is resolved on
 * its own: it goes to the provider beside the SSML, as the output format.
 */
export const DEFAULT_AUDIO_QUALITY: AudioQuality = AudioQuality.STANDARD;

export function audioQuality(settings: NarrationSettings): AudioQuality {
  return settings.audioQuality ?? DEFAULT_AUDIO_QUALITY;
}

// ─── Limits ──────────────────────────────────────────────────

/**
 * Azure accepts a wider range than this. Outside it the narrator is either
 * too slow to follow or a chipmunk, and nobody tuning a reflection by ear
 * means either.
 */
export const RATE_RANGE = { min: 0.5, max: 2 } as const;
export const PITCH_RANGE = { min: -50, max: 50 } as const;
/** What Azure accepts for an `mstts:silence` value. */
export const PAUSE_RANGE_MS = { min: 0, max: 5000 } as const;
