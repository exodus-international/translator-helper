/**
 * The automatic translation worker's scheduling, apart from the database and
 * the model: how many jobs run at once, how far apart they start, when the
 * queue is checked again, and when stalled jobs and missed versions go back
 * to it.
 *
 * Built with `createWorkerLoop(deps)` so a test drives it with fakes.
 */

export interface WorkerLoopOptions {
  /** Jobs talking to the model at the same time. */
  concurrency: number;
  /** Least time between two calls starting, so a big project does not burst. */
  minIntervalMs: number;
  /** How long an empty queue waits before it is checked again (enqueueing wakes it sooner). */
  pollMs: number;
  /** A RUNNING job older than this belongs to a server that stopped. */
  leaseMs: number;
}

export interface WorkerLoopDeps {
  claim: () => Promise<{ id: string } | null>;
  run: (jobId: string) => Promise<unknown>;
  requeueStalled: (leaseMs: number) => Promise<number>;
  /** Queues what a failed or interrupted queueing missed; run with the stalled check. */
  queueMissed?: () => Promise<number>;
  log?: (message: string, error?: unknown) => void;
  now?: () => number;
}

export function createWorkerLoop(deps: WorkerLoopDeps, options: WorkerLoopOptions) {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((message: string, error?: unknown) => console.error(`[AutoTranslation] ${message}`, error ?? ''));

  let stopped = false;
  let active = 0;
  let lastStart = 0;
  let pausedUntil = 0;
  let lastStalledCheck = 0;
  let waiter: { resolve: () => void; timer: ReturnType<typeof setTimeout> } | null = null;
  const running = new Set<Promise<unknown>>();
  let done: Promise<void> | null = null;

  /** Sleeps until `ms` pass or something wakes the loop: a new job, a free slot, stop. */
  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        waiter = null;
        resolve();
      }, ms);
      waiter = { resolve, timer };
    });
  }

  function wake() {
    if (!waiter) return;
    clearTimeout(waiter.timer);
    const { resolve } = waiter;
    waiter = null;
    resolve();
  }

  async function requeueStalled() {
    lastStalledCheck = now();
    try {
      const count = await deps.requeueStalled(options.leaseMs);
      if (count > 0) log(`Re-queued ${count} stalled job(s).`);
    } catch (error) {
      log('Re-queueing stalled jobs failed:', error);
    }
    if (!deps.queueMissed) return;
    try {
      const count = await deps.queueMissed();
      if (count > 0) log(`Queued ${count} missed version(s).`);
    } catch (error) {
      log('Queueing missed versions failed:', error);
    }
  }

  async function loop() {
    await requeueStalled();

    while (!stopped) {
      if (active >= options.concurrency) {
        await sleep(options.pollMs);
        continue;
      }

      const wait = Math.max(options.minIntervalMs - (now() - lastStart), pausedUntil - now(), 0);
      if (wait > 0) {
        await sleep(wait);
        continue;
      }

      if (now() - lastStalledCheck >= options.leaseMs / 2) await requeueStalled();

      let job: { id: string } | null = null;
      try {
        job = await deps.claim();
      } catch (error) {
        log('Claiming a job failed:', error);
      }
      if (!job) {
        await sleep(options.pollMs);
        continue;
      }

      lastStart = now();
      active += 1;
      const task = deps
        .run(job.id)
        .catch((error) => log(`Job ${job.id} failed unexpectedly:`, error))
        .finally(() => {
          active -= 1;
          running.delete(task);
          wake();
        });
      running.add(task);
    }
  }

  return {
    start() {
      if (!done) done = loop();
      return done;
    },
    wake,
    /** Holds every new model call until `at`: the API asked callers to wait. */
    pauseUntil(at: Date) {
      pausedUntil = Math.max(pausedUntil, at.getTime());
    },
    /** Stops claiming, and resolves once the jobs in flight have finished. */
    async stop() {
      stopped = true;
      wake();
      await done;
      await Promise.all(running);
    },
    get active() {
      return active;
    },
  };
}
