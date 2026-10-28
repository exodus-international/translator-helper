import { AudioProvider, type AudioQuality } from '@/generated/prisma/enums';

/**
 * The one interface the rest of the app talks to. Vendor specifics
 * (endpoints, auth, polling, result packaging) stay behind it.
 *
 * A provider may be asynchronous (returns a job to poll) or synchronous
 * (returns the audio on submit). Callers handle both through `SubmitOutcome`.
 */

export interface SynthesisRequest {
  /** Caller-chosen id; providers that accept one use it so retries are idempotent. */
  jobId: string;
  ssml: string;
  /** Output quality; the provider picks its own format for it. */
  quality: AudioQuality;
}

export interface SynthesisResult {
  audio: Uint8Array;
  contentType: string;
  durationMs?: number;
  sizeBytes?: number;
  billedCharacters?: number;
}

export type SubmitOutcome = { kind: 'job'; jobId: string } | { kind: 'result'; result: SynthesisResult };

export type PollOutcome =
  | { kind: 'running' }
  | { kind: 'succeeded'; result: SynthesisResult }
  | { kind: 'failed'; message: string };

export interface SpeechProvider {
  readonly id: AudioProvider;
  /** Longest single <break> the provider honours, in milliseconds. */
  readonly maxBreakMs: number;
  isConfigured(): boolean;
  submit(request: SynthesisRequest): Promise<SubmitOutcome>;
  poll(jobId: string): Promise<PollOutcome>;
  /**
   * Speaks a short SSML at once and returns the audio, for tuning a voice by
   * ear. Nothing is stored. Optional: a provider without a fast path has no
   * preview, and the settings page says so.
   */
  preview?(request: Omit<SynthesisRequest, 'jobId'>): Promise<SynthesisResult>;
}

export function getSpeechProvider(provider: AudioProvider): SpeechProvider {
  switch (provider) {
    case AudioProvider.AZURE_SPEECH: {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { azureSpeechProvider } = require('./azure-speech') as typeof import('./azure-speech');
      return azureSpeechProvider;
    }
    default:
      throw new Error(`Unknown speech provider: ${provider}`);
  }
}
