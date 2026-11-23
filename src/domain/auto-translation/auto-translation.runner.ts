import { DocumentStatus } from '@/generated/prisma/enums';

/**
 * One run of one automatic translation job: what the worker does with a job
 * it has claimed.
 *
 * Built with `createRunAutoTranslation(deps)` so a test hands in fakes for the
 * queue, the model and the clock, the way status changes and audio generation
 * are built. The model call goes through `deps.translate`, which in production
 * is `translateDocument` from the translation domain: the same function the
 * "Translate with AI" button uses.
 */

/** Attempts a job gets before it waits for someone to press Retry. */
export const MAX_ATTEMPTS = 3;

const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 15 * 60_000;

/** 30 s after the first failure, 2 min after the second, capped at 15 min. */
export function backoffMs(attempts: number): number {
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 4 ** Math.max(0, attempts - 1));
}

interface RunnableJob {
  id: string;
  attempts: number;
  lockedAt: Date | null;
  translationProjectId: string;
  autoTranslate: boolean;
  version: { id: string; status: DocumentStatus; content: string; languageId: string };
  document: { title: string; originalFilename: string | null };
  sourceContent: string | null;
}

/** What an API error says about trying again. */
interface ApiFailure {
  status?: number;
  retryAfterMs?: number | null;
}

export interface RunAutoTranslationDeps {
  loadJob: (jobId: string) => Promise<RunnableJob | null>;
  translate: (
    input: {
      documentTitle: string;
      sourceLanguageName: string;
      targetLanguageId: string;
      sourceContent: string;
      currentTranslation?: string;
      originalFilename?: string;
    },
    options: { signal?: AbortSignal },
  ) => Promise<{ translatedContent: string; model: string }>;
  complete: (input: {
    job: { id: string; lockedAt: Date | null; translationProjectId: string; versionId: string };
    content: string;
    model: string;
  }) => Promise<'written' | 'cancelled' | 'skipped' | 'lost'>;
  close: (
    job: { id: string; lockedAt: Date | null },
    status: 'FAILED' | 'CANCELLED' | 'SKIPPED',
    error: string,
  ) => Promise<boolean>;
  retryLater: (job: { id: string; lockedAt: Date | null }, at: Date, error: string, refundAttempt?: boolean) => Promise<boolean>;
  /** After a job ends for good: tells the managers when it was the project's last open one. */
  afterFinish: (translationProjectId: string) => Promise<void>;
  /** The API asked everyone to wait: the worker holds every new call until then. */
  pauseUntil?: (at: Date) => void;
  now?: () => Date;
  /** How long one model call may take before it counts as a failed attempt. */
  timeoutMs?: number;
  maxAttempts?: number;
}

export type RunOutcome = 'written' | 'cancelled' | 'skipped' | 'failed' | 'retrying' | 'lost' | 'missing';

/** Retrying cannot fix these: a bad request or a key the API refuses. */
function isPermanent(failure: ApiFailure): boolean {
  const status = failure.status;
  return status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 409 && status !== 429;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    return error.name === 'TimeoutError' || error.name === 'AbortError' ? 'The model took too long to answer.' : error.message;
  }
  return String(error);
}

export function createRunAutoTranslation(deps: RunAutoTranslationDeps) {
  const now = deps.now ?? (() => new Date());
  const maxAttempts = deps.maxAttempts ?? MAX_ATTEMPTS;
  const timeoutMs = deps.timeoutMs ?? 5 * 60_000;

  async function finish(
    job: RunnableJob,
    status: 'FAILED' | 'CANCELLED' | 'SKIPPED',
    error: string,
  ): Promise<RunOutcome> {
    if (!(await deps.close(job, status, error))) return 'lost';
    await deps.afterFinish(job.translationProjectId);
    return status === 'FAILED' ? 'failed' : status === 'CANCELLED' ? 'cancelled' : 'skipped';
  }

  return async function runAutoTranslation(jobId: string): Promise<RunOutcome> {
    const job = await deps.loadJob(jobId);
    if (!job) return 'missing';

    if (!job.autoTranslate) {
      return finish(job, 'CANCELLED', 'Automatic translation was turned off.');
    }
    if (job.version.status !== DocumentStatus.PENDING_TRANSLATION) {
      return finish(job, 'SKIPPED', 'Someone started this version first.');
    }
    if (!job.sourceContent?.trim()) {
      return finish(job, 'FAILED', 'The English version has no text to translate yet.');
    }

    let draft: { translatedContent: string; model: string };
    try {
      draft = await deps.translate(
        {
          documentTitle: job.document.title,
          sourceLanguageName: 'English',
          targetLanguageId: job.version.languageId,
          sourceContent: job.sourceContent,
          // Text someone typed and left is a draft the model may use, as the
          // single-document button passes it.
          currentTranslation: job.version.content.trim() ? job.version.content : undefined,
          originalFilename: job.document.originalFilename ?? undefined,
        },
        { signal: AbortSignal.timeout(timeoutMs) },
      );
    } catch (error) {
      const failure = (error ?? {}) as ApiFailure;
      const message = messageOf(error);

      // Rate limited: the API, not this document, is the problem. Wait as long
      // as it asked, hold every other call too, and keep the attempt.
      if (failure.status === 429) {
        const at = new Date(now().getTime() + (failure.retryAfterMs ?? backoffMs(job.attempts)));
        deps.pauseUntil?.(at);
        return (await deps.retryLater(job, at, message, true)) ? 'retrying' : 'lost';
      }

      if (isPermanent(failure) || job.attempts >= maxAttempts) {
        return finish(job, 'FAILED', message);
      }

      const at = new Date(now().getTime() + (failure.retryAfterMs ?? backoffMs(job.attempts)));
      return (await deps.retryLater(job, at, message)) ? 'retrying' : 'lost';
    }

    const outcome = await deps.complete({
      job: { id: job.id, lockedAt: job.lockedAt, translationProjectId: job.translationProjectId, versionId: job.version.id },
      content: draft.translatedContent,
      model: draft.model,
    });
    if (outcome !== 'lost') await deps.afterFinish(job.translationProjectId);
    return outcome;
  };
}
