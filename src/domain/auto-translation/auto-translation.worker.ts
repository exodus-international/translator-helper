import { notifyAutoTranslationFinished } from '../notification/notification.service';
import { translateDocument } from '../translation/translation.document';
import { createWorkerLoop, type WorkerLoopOptions } from './auto-translation.loop';
import {
  claimDrainSummary,
  claimNextAutoTranslation,
  closeAutoTranslation,
  completeAutoTranslation,
  enqueueMissedAutoTranslations,
  loadAutoTranslationJob,
  requeueStalledAutoTranslations,
  retryAutoTranslationLater,
} from './auto-translation.repository';
import { createRunAutoTranslation } from './auto-translation.runner';

/**
 * The automatic translation worker: one per server process, started from
 * `instrumentation.ts` when the server starts. Jobs live in the database, so
 * a restart loses nothing; jobs a stopped server left RUNNING are re-queued
 * once their lease runs out, and versions of an enabled project that never
 * got a job are queued on start and with every stalled check.
 *
 * Kept on `globalThis` because dev reloads modules on every change and server
 * actions may load their own copy of this module; either way there is one
 * loop, and enqueueing wakes that one.
 */

const KEY = Symbol.for('translation-helper.auto-translation-worker');

type Worker = ReturnType<typeof createWorkerLoop>;
const registry = globalThis as typeof globalThis & { [KEY]?: Worker };

function numberFromEnv(name: string, fallback: number, min: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= min ? value : fallback;
}

/** Env-tunable, so a provider with a tighter rate limit can be met without a deploy. */
function workerOptionsFromEnv(): WorkerLoopOptions {
  return {
    concurrency: numberFromEnv('AUTO_TRANSLATE_CONCURRENCY', 2, 1),
    minIntervalMs: numberFromEnv('AUTO_TRANSLATE_MIN_INTERVAL_MS', 1000, 0),
    pollMs: numberFromEnv('AUTO_TRANSLATE_POLL_MS', 5000, 100),
    leaseMs: numberFromEnv('AUTO_TRANSLATE_LEASE_MS', 10 * 60_000, 60_000),
  };
}

async function afterFinish(translationProjectId: string) {
  try {
    const summary = await claimDrainSummary(translationProjectId);
    if (summary) await notifyAutoTranslationFinished({ translationProjectId, ...summary });
  } catch (error) {
    console.error('[AutoTranslation] Summary notification failed:', error);
  }
}

export function startAutoTranslationWorker(): Worker {
  const existing = registry[KEY];
  if (existing) return existing;

  const options = workerOptionsFromEnv();
  let worker: Worker | null = null;
  const run = createRunAutoTranslation({
    loadJob: loadAutoTranslationJob,
    translate: translateDocument,
    complete: completeAutoTranslation,
    close: closeAutoTranslation,
    retryLater: retryAutoTranslationLater,
    afterFinish,
    pauseUntil: (at) => worker?.pauseUntil(at),
    // Half the lease, so a slow call fails as an attempt before another server
    // could take the job for stalled.
    timeoutMs: options.leaseMs / 2,
  });

  worker = createWorkerLoop(
    {
      claim: claimNextAutoTranslation,
      run,
      requeueStalled: requeueStalledAutoTranslations,
      queueMissed: enqueueMissedAutoTranslations,
    },
    options,
  );
  registry[KEY] = worker;
  void worker.start();
  return worker;
}

/** Called after queueing, so new work starts now rather than at the next poll. */
export function wakeAutoTranslationWorker() {
  registry[KEY]?.wake();
}
