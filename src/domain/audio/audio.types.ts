import type { AudioProvider, AudioStatus } from '@prisma/client';
import type { AudioTranscriptState } from './audio.rules';

export type { AudioTranscriptState };

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
  /** False when the reader may look but not change it. */
  canEdit: boolean;
  /** Why they may not, in words meant for them. */
  readOnlyReason?: string;
}
