import type { AudioProvider, DocumentType } from '@prisma/client';
import { markdownToSpeechScript } from './audio.script';
import { DEFAULT_PROSODY, speechScriptToSsml } from './audio.ssml';
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

// ─── The transcript ──────────────────────────────────────────
//
// The SSML a version is spoken from is normally derived from its Markdown, but
// a person may store their own and have that sent instead. These decide which
// one wins and what state the transcript is in; the service does the talking to
// the database and the provider.

/** `cs-CZ-AntoninNeural` -> `cs-CZ`. Provider voice ids lead with their locale. */
export function localeFromVoice(voice: string): string {
  return voice.split('-').slice(0, 2).join('-');
}

export interface TranscriptInput {
  /** The version's stored Markdown. */
  content: string;
  /** Provider voice identifier for the document's language. */
  voice: string;
  /** Longest single break the provider honours. */
  maxBreakMs: number;
}

/** Exactly what generation would send for a version with no override. */
export function deriveAudioSsml({ content, voice, maxBreakMs }: TranscriptInput): string {
  return speechScriptToSsml(markdownToSpeechScript(content), {
    voice,
    locale: localeFromVoice(voice),
    maxBreakMs,
    ...DEFAULT_PROSODY,
  });
}

export type AudioSsmlSource = 'derived' | 'override';

export interface ResolvedAudioSsml {
  ssml: string;
  source: AudioSsmlSource;
}

/**
 * The one answer to "what SSML do we send for this version, and where did it
 * come from". A stored override is sent verbatim, wrapper and voice included,
 * which is what lets someone fix a pronunciation without touching the text
 * readers see — and what makes an edited document keep its voice after the
 * language's default changes.
 */
export function resolveAudioSsml(input: TranscriptInput & { override?: string | null }): ResolvedAudioSsml {
  const override = input.override?.trim();
  if (override) return { ssml: input.override!, source: 'override' };
  return { ssml: deriveAudioSsml(input), source: 'derived' };
}

export type AudioTranscriptState = 'generated' | 'edited' | 'edited_outdated';

/**
 * What state a version's transcript is in: derived from the document, hand
 * edited, or hand edited before the document moved on underneath it.
 *
 * The third value arrives with the conflict work; until a fingerprint is
 * stored, an override is simply "edited".
 */
export function transcriptState(input: { override?: string | null }): AudioTranscriptState {
  return input.override?.trim() ? 'edited' : 'generated';
}

/** True when the document has no readable words left after the Markdown comes off. */
export function hasReadableText(content: string): boolean {
  return markdownToSpeechScript(content).segments.some((segment) => segment.kind === 'text');
}
