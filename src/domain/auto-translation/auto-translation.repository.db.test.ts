/**
 * The automatic translation queue against the seeded database: what turning
 * the setting on queues, how the worker claims and writes, and what turning it
 * off does to work in flight. The model is not called here; the runner's
 * decisions have their own unit test.
 *
 * Exodus 90 in French has one version nobody has started, and German has one
 * not started and one in progress, so both are left to these tests.
 */
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AutoTranslationStatus, DocumentStatus } from '@/generated/prisma/enums';
import prisma from '@/lib/db';
import { SEEDED_USERS, seededTranslationProject, seededUser } from '../../../tests/seeded';
import {
  cancelAutoTranslations,
  claimDrainSummary,
  claimNextAutoTranslation,
  closeAutoTranslation,
  completeAutoTranslation,
  countAutoTranslateCandidates,
  enqueueAutoTranslations,
  getAutoTranslationProgress,
  getMachineTranslation,
  loadAutoTranslationJob,
  requeueStalledAutoTranslations,
  retryAutoTranslations,
  setAutoTranslate,
} from './auto-translation.repository';

type Snapshot = { id: string; status: DocumentStatus; content: string; version: number };
let snapshot: Snapshot[] = [];

async function project(code: 'fr' | 'de') {
  return seededTranslationProject('exodus90', code);
}

async function versionsOf(code: 'fr' | 'de') {
  const tp = await project(code);
  return prisma.documentVersion.findMany({
    where: { languageId: tp.languageId, document: { sourceProjectId: tp.sourceProjectId } },
    select: { id: true, status: true, content: true, version: true },
  });
}

/** Turns the setting on for French as an administrator, and queues it. */
async function frenchOn() {
  const tp = await project('fr');
  const manager = await seededUser(SEEDED_USERS.admin);
  await setAutoTranslate(tp.id, true, manager.id);
  const queued = await enqueueAutoTranslations({ project: tp, requestedById: manager.id });
  return { tp, manager, queued };
}

after(() => prisma.$disconnect());

beforeEach(async () => {
  snapshot = [...(await versionsOf('fr')), ...(await versionsOf('de'))];
});

afterEach(async () => {
  await prisma.autoTranslation.deleteMany();
  await prisma.activityLog.deleteMany({ where: { action: 'auto_translated' } });
  for (const code of ['fr', 'de'] as const) {
    const tp = await project(code);
    await prisma.translationProject.update({
      where: { id: tp.id },
      data: { autoTranslate: false, autoTranslateChangedAt: null, autoTranslateChangedById: null, autoTranslateNotifiedAt: null },
    });
  }
  for (const version of snapshot) {
    await prisma.documentVersion.update({
      where: { id: version.id },
      data: { status: version.status, content: version.content, version: version.version },
    });
  }
});

describe('queueing', () => {
  it('queues only the versions nobody has started, once', async () => {
    const tp = await project('de');
    const before = await versionsOf('de');
    assert.equal(before.filter((v) => v.status === DocumentStatus.PENDING_TRANSLATION).length, 1);
    assert.equal(await countAutoTranslateCandidates(tp), 1);

    assert.equal(await enqueueAutoTranslations({ project: tp, requestedById: null }), 1);
    // A second run finds nothing new to queue: the open job is the version's one row.
    assert.equal(await enqueueAutoTranslations({ project: tp, requestedById: null }), 0);
    assert.equal(await countAutoTranslateCandidates(tp), 0);

    const jobs = await prisma.autoTranslation.findMany({ where: { translationProjectId: tp.id } });
    assert.equal(jobs.length, 1);
    const pending = before.find((v) => v.status === DocumentStatus.PENDING_TRANSLATION)!;
    assert.equal(jobs[0].documentVersionId, pending.id);
    assert.equal(jobs[0].status, AutoTranslationStatus.QUEUED);
  });

  it('reuses an ended job row when the version is queued again', async () => {
    const { tp } = await frenchOn();
    assert.equal(await cancelAutoTranslations(tp.id), 1);

    assert.equal(await enqueueAutoTranslations({ project: tp, requestedById: null }), 1);
    const jobs = await prisma.autoTranslation.findMany({ where: { translationProjectId: tp.id } });
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].status, AutoTranslationStatus.QUEUED);
    assert.equal(jobs[0].error, null);
    assert.equal(jobs[0].finishedAt, null);
  });
});

describe('the worker', () => {
  it('claims a due job once, and a second claim finds nothing', async () => {
    await frenchOn();
    const claimed = await claimNextAutoTranslation();
    assert.ok(claimed);
    assert.equal(await claimNextAutoTranslation(), null);

    const job = await loadAutoTranslationJob(claimed.id);
    assert.equal(job?.status, AutoTranslationStatus.RUNNING);
    assert.equal(job?.attempts, 1);
    assert.equal(job?.autoTranslate, true);
    assert.ok(job?.sourceContent, 'loads the English text');
  });

  it('writes the draft, moves the version to review and logs it', async () => {
    const { tp, manager } = await frenchOn();
    const claimed = (await claimNextAutoTranslation())!;
    const job = (await loadAutoTranslationJob(claimed.id))!;

    const outcome = await completeAutoTranslation({
      job: { id: job.id, lockedAt: job.lockedAt, translationProjectId: tp.id, versionId: job.version.id },
      content: 'Bonjour',
      model: 'gpt-test',
    });
    assert.equal(outcome, 'written');

    const version = await prisma.documentVersion.findUniqueOrThrow({ where: { id: job.version.id } });
    assert.equal(version.status, DocumentStatus.PENDING_REVIEW);
    assert.equal(version.content, 'Bonjour');
    assert.equal(version.version, snapshot.find((v) => v.id === version.id)!.version + 1);

    assert.deepEqual(await getMachineTranslation(version.id).then((m) => m && { ...m, finishedAt: null }), {
      machineContent: 'Bonjour',
      model: 'gpt-test',
      finishedAt: null,
    });

    const [log] = await prisma.activityLog.findMany({ where: { documentVersionId: version.id, action: 'auto_translated' } });
    assert.equal(log.userId, manager.id);
    assert.deepEqual(log.details, { model: 'gpt-test' });
  });

  it('discards the draft when the setting was turned off while the model worked', async () => {
    const { tp } = await frenchOn();
    const claimed = (await claimNextAutoTranslation())!;
    const job = (await loadAutoTranslationJob(claimed.id))!;

    await setAutoTranslate(tp.id, false, (await seededUser(SEEDED_USERS.admin)).id);
    // The running job is left alone by the cancel; it finds out when it writes.
    assert.equal(await cancelAutoTranslations(tp.id), 0);

    const outcome = await completeAutoTranslation({
      job: { id: job.id, lockedAt: job.lockedAt, translationProjectId: tp.id, versionId: job.version.id },
      content: 'Bonjour',
      model: 'gpt-test',
    });
    assert.equal(outcome, 'cancelled');
    const version = await prisma.documentVersion.findUniqueOrThrow({ where: { id: job.version.id } });
    assert.equal(version.status, DocumentStatus.PENDING_TRANSLATION);
    assert.equal(await getMachineTranslation(version.id), null);
  });

  it('leaves a version someone started while the model worked', async () => {
    const { tp } = await frenchOn();
    const claimed = (await claimNextAutoTranslation())!;
    const job = (await loadAutoTranslationJob(claimed.id))!;
    await prisma.documentVersion.update({ where: { id: job.version.id }, data: { status: DocumentStatus.IN_PROGRESS, content: 'Mon texte' } });

    const outcome = await completeAutoTranslation({
      job: { id: job.id, lockedAt: job.lockedAt, translationProjectId: tp.id, versionId: job.version.id },
      content: 'Bonjour',
      model: 'gpt-test',
    });
    assert.equal(outcome, 'skipped');
    const version = await prisma.documentVersion.findUniqueOrThrow({ where: { id: job.version.id } });
    assert.equal(version.content, 'Mon texte');
    const row = await prisma.autoTranslation.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(row.status, AutoTranslationStatus.SKIPPED);
    assert.equal(row.machineContent, null);
  });

  it('re-queues a job whose server stopped, and the old claim can no longer write', async () => {
    const { tp } = await frenchOn();
    const claimed = (await claimNextAutoTranslation())!;
    const stale = (await loadAutoTranslationJob(claimed.id))!;
    await prisma.autoTranslation.update({ where: { id: claimed.id }, data: { lockedAt: new Date(Date.now() - 60_000) } });
    const staleClaim = { ...stale, lockedAt: new Date(Date.now() - 60_000) };

    assert.equal(await requeueStalledAutoTranslations(30_000), 1);
    const again = (await claimNextAutoTranslation())!;
    assert.equal(again.id, claimed.id);
    assert.equal((await loadAutoTranslationJob(again.id))?.attempts, 2);

    assert.equal(await closeAutoTranslation(staleClaim, 'FAILED', 'late'), false);
    assert.equal(
      await completeAutoTranslation({
        job: { id: stale.id, lockedAt: staleClaim.lockedAt, translationProjectId: tp.id, versionId: stale.version.id },
        content: 'Trop tard',
        model: 'gpt-test',
      }),
      'lost',
    );
    const version = await prisma.documentVersion.findUniqueOrThrow({ where: { id: stale.version.id } });
    assert.equal(version.status, DocumentStatus.PENDING_TRANSLATION);
  });
});

describe('failures, retry and the summary', () => {
  it('counts progress, retries a failure, and sends the summary once', async () => {
    const { tp } = await frenchOn();
    const claimed = (await claimNextAutoTranslation())!;
    assert.equal(await claimDrainSummary(tp.id), null, 'no summary while a job is open');

    assert.equal(await closeAutoTranslation(claimed, 'FAILED', 'ChatGPT API request failed: 500'), true);
    let progress = await getAutoTranslationProgress(tp.id);
    assert.deepEqual(
      { queued: progress.queued, running: progress.running, succeeded: progress.succeeded, failed: progress.failed },
      { queued: 0, running: 0, succeeded: 0, failed: 1 },
    );
    assert.equal(progress.failures[0].error, 'ChatGPT API request failed: 500');
    assert.ok(progress.failures[0].document.title);

    assert.deepEqual(await claimDrainSummary(tp.id), { translated: 0, failed: 1 });
    assert.equal(await claimDrainSummary(tp.id), null, 'told once');

    assert.equal(await retryAutoTranslations(tp.id), 1);
    progress = await getAutoTranslationProgress(tp.id);
    assert.equal(progress.queued, 1);
    assert.equal(progress.failed, 0);
    const row = await prisma.autoTranslation.findUniqueOrThrow({ where: { id: claimed.id } });
    assert.equal(row.attempts, 0);
  });

  it('turning the setting off cancels queued and failed work', async () => {
    const { tp } = await frenchOn();
    const de = await project('de');
    await setAutoTranslate(de.id, true, (await seededUser(SEEDED_USERS.admin)).id);
    await enqueueAutoTranslations({ project: de, requestedById: null });

    const claimed = (await claimNextAutoTranslation())!;
    await closeAutoTranslation(claimed, 'FAILED', 'boom');

    assert.equal(await cancelAutoTranslations(tp.id) + (await cancelAutoTranslations(de.id)), 2);
    const statuses = (await prisma.autoTranslation.findMany()).map((job) => job.status);
    assert.deepEqual(statuses, [AutoTranslationStatus.CANCELLED, AutoTranslationStatus.CANCELLED]);
  });
});
