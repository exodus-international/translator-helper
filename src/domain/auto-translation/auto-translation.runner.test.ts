import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AutoTranslationFailure, DocumentStatus } from '@/generated/prisma/enums';
import { TranslationApiError } from '../translation/translation.service';
import { backoffMs, createRunAutoTranslation, type RunAutoTranslationDeps } from './auto-translation.runner';

const NOW = new Date('2026-11-23T10:00:00Z');

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    attempts: 1,
    lockedAt: NOW,
    translationProjectId: 'tp-1',
    autoTranslate: true,
    version: { id: 'v-1', status: DocumentStatus.PENDING_TRANSLATION, content: '', languageId: 'lang-cs' },
    document: { title: 'Day 1', originalFilename: '1.md' },
    sourceContent: 'Hello',
    ...overrides,
  };
}

function setup(loaded: ReturnType<typeof job> | null, translate?: RunAutoTranslationDeps['translate']) {
  const calls: { name: string; args: unknown[] }[] = [];
  const record =
    <T>(name: string, value: T) =>
    async (...args: unknown[]) => {
      calls.push({ name, args });
      return value;
    };
  const paused: Date[] = [];
  const reported: { error: unknown; context: Parameters<NonNullable<RunAutoTranslationDeps['report']>>[1] }[] = [];
  const run = createRunAutoTranslation({
    loadJob: async () => loaded,
    translate:
      translate ??
      (async (input) => {
        calls.push({ name: 'translate', args: [input] });
        return { translatedContent: 'Ahoj', model: 'gpt-test' };
      }),
    complete: record('complete', 'written' as const),
    close: record('close', true),
    retryLater: record('retryLater', true),
    afterFinish: record('afterFinish', undefined),
    pauseUntil: (at) => paused.push(at),
    report: (error, context) => reported.push({ error, context }),
    now: () => NOW,
  });
  const called = (name: string) => calls.filter((call) => call.name === name);
  return { run, calls, called, paused, reported };
}

describe('backoffMs', () => {
  it('grows fourfold per attempt and stops at fifteen minutes', () => {
    assert.equal(backoffMs(1), 30_000);
    assert.equal(backoffMs(2), 120_000);
    assert.equal(backoffMs(3), 480_000);
    assert.equal(backoffMs(9), 900_000);
  });
});

describe('runAutoTranslation', () => {
  it('translates through the shared function and writes the draft', async () => {
    const { run, called } = setup(job());
    assert.equal(await run('job-1'), 'written');

    const [translate] = called('translate');
    assert.deepEqual(translate.args[0], {
      documentTitle: 'Day 1',
      sourceLanguageName: 'English',
      targetLanguageId: 'lang-cs',
      sourceContent: 'Hello',
      currentTranslation: undefined,
      originalFilename: '1.md',
    });
    assert.deepEqual(called('complete')[0].args[0], {
      job: { id: 'job-1', lockedAt: NOW, translationProjectId: 'tp-1', versionId: 'v-1' },
      content: 'Ahoj',
      model: 'gpt-test',
    });
    assert.equal(called('afterFinish').length, 1);
  });

  it('passes text someone left on the version as the reference draft', async () => {
    const { run, called } = setup(job({ version: { ...job().version, content: 'Ahoj sv' } }));
    await run('job-1');
    assert.equal((called('translate')[0].args[0] as { currentTranslation?: string }).currentTranslation, 'Ahoj sv');
  });

  it('cancels without calling the model once the setting is off', async () => {
    const { run, called } = setup(job({ autoTranslate: false }));
    assert.equal(await run('job-1'), 'cancelled');
    assert.equal(called('translate').length, 0);
    assert.equal(called('close')[0].args[1], 'CANCELLED');
  });

  it('skips a version someone has started', async () => {
    const { run, called } = setup(job({ version: { ...job().version, status: DocumentStatus.IN_PROGRESS } }));
    assert.equal(await run('job-1'), 'skipped');
    assert.equal(called('translate').length, 0);
  });

  it('fails a document whose English text is empty, without retrying', async () => {
    const { run, called } = setup(job({ sourceContent: '  ' }));
    assert.equal(await run('job-1'), 'failed');
    assert.match(called('close')[0].args[2] as string, /no text/);
  });

  it('retries a failed call with backoff while attempts remain', async () => {
    const { run, called } = setup(job({ attempts: 2 }), async () => {
      throw new Error('socket hang up');
    });
    assert.equal(await run('job-1'), 'retrying');
    const [retry] = called('retryLater');
    assert.equal((retry.args[1] as Date).getTime(), NOW.getTime() + backoffMs(2));
    assert.equal(retry.args[2], 'socket hang up');
    assert.equal(retry.args[3], false, 'the attempt counts');
    assert.equal(called('afterFinish').length, 0);
  });

  it('marks the job failed after the last attempt, and checks for the summary', async () => {
    const { run, called } = setup(job({ attempts: 3 }), async () => {
      throw new Error('socket hang up');
    });
    assert.equal(await run('job-1'), 'failed');
    assert.equal(called('close')[0].args[1], 'FAILED');
    assert.equal(called('afterFinish').length, 1);
  });

  it('fails at once on an error retrying cannot fix', async () => {
    const { run, called } = setup(job({ attempts: 1 }), async () => {
      throw new TranslationApiError('ChatGPT API request failed: 401 Unauthorized - bad key', 401, null);
    });
    assert.equal(await run('job-1'), 'failed');
    assert.match(called('close')[0].args[2] as string, /401/);
  });

  it('keeps the raw error on the job, stores a plain reason, and reports the error', async () => {
    const raw = new TranslationApiError('ChatGPT API request failed: 400 Bad Request - {"error":{}}', 400, null);
    const { run, called, reported } = setup(job({ attempts: 1 }), async () => {
      throw raw;
    });
    assert.equal(await run('job-1'), 'failed');
    const [, , error, reason] = called('close')[0].args;
    assert.equal(error, raw.message);
    assert.equal(reason, AutoTranslationFailure.REJECTED);
    assert.deepEqual(reported, [
      { error: raw, context: { jobId: 'job-1', attempts: 1, reason: AutoTranslationFailure.REJECTED, final: true } },
    ]);
  });

  it('reports an attempt that will be retried as not final', async () => {
    const { run, called, reported } = setup(job({ attempts: 1 }), async () => {
      throw new TranslationApiError('ChatGPT API request failed: 503', 503, null);
    });
    assert.equal(await run('job-1'), 'retrying');
    assert.equal(called('retryLater')[0].args[4], AutoTranslationFailure.UNAVAILABLE);
    assert.equal(reported[0].context.final, false);
  });

  it('marks a version with no English text with its own reason', async () => {
    const { run, called } = setup(job({ sourceContent: '  ' }));
    assert.equal(await run('job-1'), 'failed');
    assert.equal(called('close')[0].args[3], AutoTranslationFailure.NO_SOURCE);
  });

  it('waits as long as a 429 asks, pauses every call, and keeps the attempt', async () => {
    const { run, called, paused } = setup(job({ attempts: 3 }), async () => {
      throw new TranslationApiError('ChatGPT API request failed: 429 Too Many Requests - slow down', 429, 20_000);
    });
    assert.equal(await run('job-1'), 'retrying');
    const [retry] = called('retryLater');
    assert.equal((retry.args[1] as Date).getTime(), NOW.getTime() + 20_000);
    assert.equal(retry.args[3], true);
    assert.equal(retry.args[4], AutoTranslationFailure.RATE_LIMITED);
    assert.deepEqual(paused, [new Date(NOW.getTime() + 20_000)]);
  });

  it('reports a job that no longer exists', async () => {
    const { run } = setup(null);
    assert.equal(await run('job-1'), 'missing');
  });
});
