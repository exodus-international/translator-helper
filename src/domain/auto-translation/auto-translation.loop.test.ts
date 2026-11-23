import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerLoop } from './auto-translation.loop';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('worker loop', () => {
  it('runs no more jobs at once than its concurrency', async () => {
    const queue = ['a', 'b', 'c', 'd'];
    const gates = new Map(queue.map((id) => [id, deferred()]));
    const started: string[] = [];
    let peak = 0;
    let active = 0;

    const loop = createWorkerLoop(
      {
        claim: async () => {
          const id = queue.shift();
          return id ? { id } : null;
        },
        run: async (id) => {
          started.push(id);
          active += 1;
          peak = Math.max(peak, active);
          await gates.get(id)!.promise;
          active -= 1;
        },
        requeueStalled: async () => 0,
      },
      { concurrency: 2, minIntervalMs: 0, pollMs: 10, leaseMs: 60_000 },
    );
    void loop.start();

    await tick();
    assert.deepEqual(started, ['a', 'b']);

    gates.get('a')!.resolve();
    await tick();
    assert.deepEqual(started, ['a', 'b', 'c']);

    for (const gate of gates.values()) gate.resolve();
    await tick();
    await tick();
    await loop.stop();
    assert.deepEqual(started, ['a', 'b', 'c', 'd']);
    assert.equal(peak, 2);
  });

  it('re-queues stalled jobs when it starts', async () => {
    const leases: number[] = [];
    const loop = createWorkerLoop(
      { claim: async () => null, run: async () => {}, requeueStalled: async (lease) => (leases.push(lease), 0) },
      { concurrency: 1, minIntervalMs: 0, pollMs: 10, leaseMs: 60_000 },
    );
    void loop.start();
    await tick();
    await loop.stop();
    assert.deepEqual(leases, [60_000]);
  });

  it('spaces the starts of consecutive jobs', async () => {
    const queue = ['a', 'b', 'c'];
    const startedAt: number[] = [];
    const loop = createWorkerLoop(
      {
        claim: async () => {
          const id = queue.shift();
          return id ? { id } : null;
        },
        run: async () => {
          startedAt.push(Date.now());
        },
        requeueStalled: async () => 0,
      },
      { concurrency: 5, minIntervalMs: 40, pollMs: 10, leaseMs: 60_000 },
    );
    void loop.start();
    await new Promise((resolve) => setTimeout(resolve, 150));
    await loop.stop();
    assert.equal(startedAt.length, 3);
    for (let i = 1; i < startedAt.length; i++) {
      assert.ok(startedAt[i] - startedAt[i - 1] >= 35, `gap ${startedAt[i] - startedAt[i - 1]}ms`);
    }
  });

  it('holds every call while the API asked to wait, and a wake starts waiting work at once', async () => {
    const queue: string[] = [];
    const started: string[] = [];
    const loop = createWorkerLoop(
      {
        claim: async () => {
          const id = queue.shift();
          return id ? { id } : null;
        },
        run: async (id) => {
          started.push(id);
        },
        requeueStalled: async () => 0,
      },
      { concurrency: 1, minIntervalMs: 0, pollMs: 10_000, leaseMs: 60_000 },
    );
    void loop.start();
    await tick();

    queue.push('a');
    loop.wake();
    await tick();
    assert.deepEqual(started, ['a']);

    loop.pauseUntil(new Date(Date.now() + 60));
    queue.push('b');
    loop.wake();
    await tick();
    assert.deepEqual(started, ['a']);
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.deepEqual(started, ['a', 'b']);
    await loop.stop();
  });
});
