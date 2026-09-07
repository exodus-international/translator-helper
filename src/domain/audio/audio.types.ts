import type { AudioProvider, AudioStatus } from '@prisma/client';
import type { AudioSsmlSource, AudioTranscriptState } from './audio.rules';

export type { AudioSsmlSource, AudioTranscriptState };

export type { AudioProvider, AudioStatus };

/** What the caller of a status transition learns about the audio side effect. */
export type AudioGenerationOutcome =
  | { status: 'success'; audioFileId: string }
  | { status: 'skipped'; reason: AudioSkipReason }
  | { status: 'failed'; error: string };

export type AudioSkipReason =
  | 'storage_not_configured'
  | 'provider_not_configured'
  | 'no_voice_for_language'
  | 'document_type_not_enabled'
  | 'document_type_missing';

export const AUDIO_SKIP_MESSAGES: Record<AudioSkipReason, string> = {
  storage_not_configured: 'Audio storage is not configured',
  provider_not_configured: 'The speech provider is not configured',
  no_voice_for_language: 'This language has no voice configured',
  document_type_not_enabled: 'Audio is not enabled for this document type',
  document_type_missing: 'The document has no type set',
};

/** What a deployer needs to know before shipping a version. */
export interface AudioReadiness {
  state: 'ready' | 'stale' | 'pending' | 'failed' | 'missing' | 'not_applicable';
  url?: string;
}

export const AUDIO_CONTENT_TYPE = 'audio/mpeg';
export const AUDIO_FILE_EXTENSION = 'mp3';

/** Shape handed to the client card; dates serialised by the server action. */
export interface AudioFileView {
  id: string;
  status: AudioStatus;
  provider: AudioProvider;
  voice: string;
  sourceVersion: number;
  url: string | null;
  durationMs: number | null;
  sizeBytes: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

/** What the Audio text tab needs to render itself. */
export interface AudioTranscriptView {
  ssml: string;
  state: AudioTranscriptState;
  /**
   * Whether `ssml` is a stored override or was derived from the document just
   * now. The tab sends it back when it saves, so a write can be refused when
   * someone else has changed the transcript in the meantime.
   */
  source: AudioSsmlSource;
  /** False when the reader may look but not change it. */
  canEdit: boolean;
  /** Why they may not, in words meant for them. */
  readOnlyReason?: string;
}

/**
 * The result of writing a transcript. A conflict is not an error: it means the
 * stored override is no longer the one the tab was editing, and it comes back
 * with what is there now so the person can compare without a second round trip.
 */
export type AudioTranscriptWriteOutcome =
  | { status: 'saved' }
  /** `current` is null when the document stopped getting audio altogether. */
  | { status: 'conflict'; current: AudioTranscriptView | null };
