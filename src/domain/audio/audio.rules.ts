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
 *
 * Deriving is passed in as a function, not a value, for two reasons: it is
 * wasted work when an override exists, and it needs a Markdown parser that
 * must not follow this module into a browser bundle. The audio card imports
 * these rules.
 */
export function resolveAudioSsml(input: { override?: string | null; derive: () => string }): ResolvedAudioSsml {
  const override = input.override?.trim();
  if (override) return { ssml: input.override!, source: 'override' };
  return { ssml: input.derive(), source: 'derived' };
}

export type AudioTranscriptState = 'generated' | 'edited' | 'edited_outdated';

/**
 * A short, stable fingerprint of a string. FNV-1a: no crypto import, so this
 * module stays usable wherever the rules are, and a hash rather than the text
 * itself keeps a second copy of every transcript out of the database.
 *
 * Collisions would mean a missed prompt, never a wrong transcript. The
 * override is still what gets spoken either way.
 */
export function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${text.length.toString(36)}-${hash.toString(36)}`;
}

/**
 * The fingerprint an override's baseline is stored as. Whitespace between tags
 * comes out first: how the derived SSML is laid out is not what a narrator
 * reads, and someone who edited their transcript should not be told the
 * document moved because the formatter learned to indent.
 */
export function transcriptBaseline(derivedSsml: string): string {
  return fingerprint(derivedSsml.replace(/>\s+</g, '><'));
}

/**
 * What state a version's transcript is in: derived from the document, hand
 * edited, or hand edited before the document moved on underneath it.
 *
 * The comparison is of derived SSML, not of the version counter. Auto-save
 * bumps that counter every few seconds of typing, so counting versions would
 * call a transcript out of date because somebody bolded a word. What matters
 * is whether the words and pauses a narrator reads actually changed.
 */
export function transcriptState(input: {
  override?: string | null;
  /** Fingerprint stored when the override was saved. */
  baseline?: string | null;
  /** What deriving from the document right now produces. */
  derived?: string | null;
}): AudioTranscriptState {
  if (!input.override?.trim()) return 'generated';
  if (!input.baseline || input.derived == null) return 'edited';
  return input.baseline === transcriptBaseline(input.derived) ? 'edited' : 'edited_outdated';
}
