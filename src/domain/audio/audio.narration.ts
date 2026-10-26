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
}

export interface NarrationProfile {
  /** Speaking rate as a factor, `0.8` being 20% slower than the voice's own pace. */
  rate: string;
  /** Pitch as a percentage, `-6%` being slightly lower. */
  pitch: string;
}

export const DEFAULT_NARRATION: NarrationProfile = { ...DEFAULT_PROSODY };

export function narrationProfile(settings: NarrationSettings): NarrationProfile {
  return {
    rate: settings.audioRate?.trim() || DEFAULT_NARRATION.rate,
    pitch: settings.audioPitch?.trim() || DEFAULT_NARRATION.pitch,
  };
}

// ─── Limits ──────────────────────────────────────────────────

/**
 * Azure accepts a wider range than this. Outside it the narrator is either
 * too slow to follow or a chipmunk, and nobody tuning a reflection by ear
 * means either.
 */
export const RATE_RANGE = { min: 0.5, max: 2 } as const;
export const PITCH_RANGE = { min: -50, max: 50 } as const;
