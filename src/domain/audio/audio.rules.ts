import type { AudioProvider, DocumentType } from '@prisma/client';
import type { AudioSkipReason } from './audio.types';

/**
 * Pure decisions about audio, kept out of the service so they can be tested
 * without a database or a provider.
 */

/**
 * Audio is stale when the text moved on after it was generated. Deliberately
 * a comparison of version counters, not of status: editing while APPROVED is
 * only prevented by the UI, so a status-based rule would miss exactly the
 * case that matters.
 */
export function isAudioStale(audio: { sourceVersion: number }, documentVersion: { version: number }): boolean {
  return documentVersion.version > audio.sourceVersion;
}

export interface EligibilityInput {
  language: { audioProvider: AudioProvider | null; audioVoice: string | null };
  document: { type: DocumentType | null; sourceProject: { audioDocumentTypes: DocumentType[] } | null };
  storageConfigured: boolean;
  providerConfigured: (provider: AudioProvider) => boolean;
}

/** Returns why generation should be skipped, or null when it may proceed. Order matters: content reasons before infrastructure ones. */
export function audioSkipReason(input: EligibilityInput): AudioSkipReason | null {
  const { language, document } = input;
  if (!language.audioProvider || !language.audioVoice) return 'no_voice_for_language';
  if (!document.type) return 'document_type_missing';
  if (!document.sourceProject?.audioDocumentTypes.includes(document.type)) return 'document_type_not_enabled';
  if (!input.storageConfigured) return 'storage_not_configured';
  if (!input.providerConfigured(language.audioProvider)) return 'provider_not_configured';
  return null;
}

export type AudioErrorKind = 'configuration' | 'content' | 'provider';

const ERROR_PREFIX = /^\[(configuration|content|provider)\]\s*/;

/** Error messages are stored with a kind prefix so the UI can tell a setup problem from a provider outage. */
export function formatAudioError(kind: AudioErrorKind, message: string): string {
  return `[${kind}] ${message}`;
}

export function parseAudioError(stored: string | null): { kind: AudioErrorKind | 'unknown'; message: string } {
  if (!stored) return { kind: 'unknown', message: 'Unknown error' };
  const match = stored.match(ERROR_PREFIX);
  if (!match) return { kind: 'unknown', message: stored };
  return { kind: match[1] as AudioErrorKind, message: stored.slice(match[0].length) };
}
