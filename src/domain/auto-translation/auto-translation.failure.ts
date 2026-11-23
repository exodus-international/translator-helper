import { AutoTranslationFailure } from '@/generated/prisma/enums';

/** The parts of `TranslationApiError` that say what went wrong. */
interface ApiFailure {
  status?: unknown;
}

/**
 * Why a model call failed, from the typed error alone. The raw message is
 * for the server log; this is what the project page shows.
 */
export function failureReasonOf(error: unknown): AutoTranslationFailure {
  const status = (error as ApiFailure | null | undefined)?.status;
  if (typeof status === 'number') {
    if (status === 429) return AutoTranslationFailure.RATE_LIMITED;
    if (status === 401 || status === 403) return AutoTranslationFailure.SETUP;
    if (status === 408 || status >= 500) return AutoTranslationFailure.UNAVAILABLE;
    if (status >= 400 && status !== 409) return AutoTranslationFailure.REJECTED;
    return AutoTranslationFailure.UNKNOWN;
  }
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') return AutoTranslationFailure.UNAVAILABLE;
    // fetch() rejects with this TypeError when it cannot reach the server at all.
    if (error.name === 'TypeError' && error.message === 'fetch failed') return AutoTranslationFailure.UNAVAILABLE;
  }
  return AutoTranslationFailure.UNKNOWN;
}

const MESSAGES: Record<AutoTranslationFailure, string> = {
  REJECTED: 'The AI service rejected this document. Retry, and contact an admin if it fails again.',
  SETUP: 'The AI service refused the access key. Contact an admin, then retry.',
  RATE_LIMITED: 'The AI service is busy. This document will be retried automatically.',
  UNAVAILABLE: 'The AI service was unavailable. Retry in a few minutes.',
  NO_SOURCE: 'The English version has no text yet. Add it, then retry.',
  UNKNOWN: 'Translation could not finish. Retry, and contact an admin if it fails again.',
};

/** What a project manager reads about a failure, and what they can do about it. */
export function failureMessage(reason: AutoTranslationFailure | null): string {
  return MESSAGES[reason ?? AutoTranslationFailure.UNKNOWN];
}
