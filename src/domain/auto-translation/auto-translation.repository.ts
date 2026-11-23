import prisma from '@/lib/db';
import { AutoTranslationStatus, DocumentStatus } from '@/generated/prisma/enums';

/** Jobs a worker has yet to finish. */
export const OPEN_STATUSES = [AutoTranslationStatus.QUEUED, AutoTranslationStatus.RUNNING];

/** How much of an API error is kept on the job: enough to read, not a whole HTML page. */
const ERROR_MAX = 1000;

function clip(error: string): string {
  return error.length > ERROR_MAX ? `${error.slice(0, ERROR_MAX - 1)}…` : error;
}

// ─── The project's setting ───────────────────────────────────

export async function getAutoTranslateProject(translationProjectId: string) {
  return prisma.translationProject.findUnique({
    where: { id: translationProjectId },
    select: {
      id: true,
      name: true,
      autoTranslate: true,
      autoTranslateChangedAt: true,
      autoTranslateChangedById: true,
      languageId: true,
      sourceProjectId: true,
      language: { select: { name: true, code: true } },
      sourceProject: { select: { slug: true } },
    },
  });
}

export async function setAutoTranslate(translationProjectId: string, enabled: boolean, userId: string) {
  return prisma.translationProject.update({
    where: { id: translationProjectId },
    data: { autoTranslate: enabled, autoTranslateChangedAt: new Date(), autoTranslateChangedById: userId },
    select: { id: true, autoTranslate: true },
  });
}

/** The translation projects of a source project that have the setting on. */
export async function listAutoTranslateProjects(sourceProjectId: string) {
  return prisma.translationProject.findMany({
    where: { sourceProjectId, autoTranslate: true },
    select: { id: true },
  });
}

// ─── Queueing ────────────────────────────────────────────────

/**
 * Versions of the project's language that nobody has started and that have no
 * open job: what turning the setting on would queue now.
 */
function candidateWhere(project: { languageId: string; sourceProjectId: string }, documentIds?: string[]) {
  return {
    languageId: project.languageId,
    status: DocumentStatus.PENDING_TRANSLATION,
    document: {
      sourceProjectId: project.sourceProjectId,
      ...(documentIds ? { id: { in: documentIds } } : {}),
    },
    OR: [{ autoTranslation: null }, { autoTranslation: { status: { notIn: OPEN_STATUSES } } }],
  };
}

export async function countAutoTranslateCandidates(project: { languageId: string; sourceProjectId: string }) {
  return prisma.documentVersion.count({ where: candidateWhere(project) });
}

/**
 * Queues a job for every version of the project that nobody has started.
 * Idempotent: a version with an open job keeps it, and one whose job ended
 * (cancelled, failed, skipped, or drafted before it was moved back) gets the
 * same row reset, so there is never more than one job per version.
 */
export async function enqueueAutoTranslations(input: {
  project: { id: string; languageId: string; sourceProjectId: string };
  requestedById: string | null;
  documentIds?: string[];
}): Promise<number> {
  const versions = await prisma.documentVersion.findMany({
    where: candidateWhere(input.project, input.documentIds),
    select: { id: true },
  });
  if (versions.length === 0) return 0;
  const ids = versions.map((version) => version.id);

  await prisma.$transaction([
    prisma.autoTranslation.createMany({
      data: ids.map((documentVersionId) => ({
        documentVersionId,
        translationProjectId: input.project.id,
        requestedById: input.requestedById,
      })),
      skipDuplicates: true,
    }),
    prisma.autoTranslation.updateMany({
      where: { documentVersionId: { in: ids }, status: { notIn: OPEN_STATUSES } },
      data: {
        status: AutoTranslationStatus.QUEUED,
        translationProjectId: input.project.id,
        requestedById: input.requestedById,
        attempts: 0,
        nextAttemptAt: new Date(),
        lockedAt: null,
        error: null,
        machineContent: null,
        model: null,
        finishedAt: null,
      },
    }),
  ]);
  return ids.length;
}

/**
 * Turning the setting off: queued work and failures waiting for a retry are
 * cancelled. A job already running is left to finish; it finds the setting
 * off when it comes to write, and discards its result.
 */
export async function cancelAutoTranslations(translationProjectId: string): Promise<number> {
  const { count } = await prisma.autoTranslation.updateMany({
    where: {
      translationProjectId,
      status: { in: [AutoTranslationStatus.QUEUED, AutoTranslationStatus.FAILED] },
    },
    data: {
      status: AutoTranslationStatus.CANCELLED,
      error: 'Automatic translation was turned off.',
      finishedAt: new Date(),
    },
  });
  return count;
}

/** Retry: failed jobs (one, or all of the project's) back to the queue with a fresh attempt count. */
export async function retryAutoTranslations(translationProjectId: string, jobId?: string): Promise<number> {
  const { count } = await prisma.autoTranslation.updateMany({
    where: {
      translationProjectId,
      status: AutoTranslationStatus.FAILED,
      ...(jobId ? { id: jobId } : {}),
      documentVersion: { status: DocumentStatus.PENDING_TRANSLATION },
    },
    data: {
      status: AutoTranslationStatus.QUEUED,
      attempts: 0,
      nextAttemptAt: new Date(),
      lockedAt: null,
      error: null,
      finishedAt: null,
    },
  });
  return count;
}

// ─── The worker's queue ──────────────────────────────────────

export interface ClaimedJob {
  id: string;
  lockedAt: Date;
}

/**
 * Takes the next due job and marks it RUNNING, in one statement. `SKIP LOCKED`
 * lets a second server (or a second worker in dev) claim the next row instead
 * of the same one.
 */
export async function claimNextAutoTranslation(): Promise<ClaimedJob | null> {
  const rows = await prisma.$queryRaw<ClaimedJob[]>`
    UPDATE "auto_translation"
    SET "status" = 'RUNNING', "lockedAt" = now(), "attempts" = "attempts" + 1, "updatedAt" = now()
    WHERE "id" = (
      SELECT "id" FROM "auto_translation"
      WHERE "status" = 'QUEUED' AND "nextAttemptAt" <= now()
      ORDER BY "nextAttemptAt", "createdAt"
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "lockedAt"`;
  return rows[0] ?? null;
}

/**
 * RUNNING jobs whose lease ran out belong to a server that stopped mid-job.
 * They go back to the queue; the attempt they used still counts.
 */
export async function requeueStalledAutoTranslations(leaseMs: number): Promise<number> {
  const { count } = await prisma.autoTranslation.updateMany({
    where: { status: AutoTranslationStatus.RUNNING, lockedAt: { lt: new Date(Date.now() - leaseMs) } },
    data: { status: AutoTranslationStatus.QUEUED, lockedAt: null, nextAttemptAt: new Date() },
  });
  return count;
}

/** Everything one run needs: the job, its version, the English source and whether the setting is still on. */
export async function loadAutoTranslationJob(jobId: string) {
  const job = await prisma.autoTranslation.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      status: true,
      attempts: true,
      lockedAt: true,
      translationProjectId: true,
      translationProject: { select: { autoTranslate: true } },
      documentVersion: {
        select: {
          id: true,
          status: true,
          content: true,
          languageId: true,
          document: {
            select: {
              title: true,
              originalFilename: true,
              versions: { where: { language: { code: 'en' } }, select: { content: true }, take: 1 },
            },
          },
        },
      },
    },
  });
  if (!job) return null;
  const version = job.documentVersion;
  return {
    id: job.id,
    status: job.status,
    attempts: job.attempts,
    lockedAt: job.lockedAt,
    translationProjectId: job.translationProjectId,
    autoTranslate: job.translationProject.autoTranslate,
    version: { id: version.id, status: version.status, content: version.content, languageId: version.languageId },
    document: { title: version.document.title, originalFilename: version.document.originalFilename },
    sourceContent: version.document.versions[0]?.content ?? null,
  };
}

export type AutoTranslationJob = NonNullable<Awaited<ReturnType<typeof loadAutoTranslationJob>>>;

/** The lease a write must still hold: the row is RUNNING under the claim this worker made. */
function heldBy(job: { id: string; lockedAt: Date | null }) {
  return { id: job.id, status: AutoTranslationStatus.RUNNING, lockedAt: job.lockedAt };
}

/** Ends a job without writing the version. False when the lease was lost to another worker. */
export async function closeAutoTranslation(
  job: { id: string; lockedAt: Date | null },
  status: 'FAILED' | 'CANCELLED' | 'SKIPPED',
  error: string,
): Promise<boolean> {
  const { count } = await prisma.autoTranslation.updateMany({
    where: heldBy(job),
    data: { status, error: clip(error), lockedAt: null, finishedAt: new Date() },
  });
  return count > 0;
}

/** Puts the job back in the queue for a later attempt. `refundAttempt` when the API, not the job, was at fault. */
export async function retryAutoTranslationLater(
  job: { id: string; lockedAt: Date | null },
  at: Date,
  error: string,
  refundAttempt = false,
): Promise<boolean> {
  const { count } = await prisma.autoTranslation.updateMany({
    where: heldBy(job),
    data: {
      status: AutoTranslationStatus.QUEUED,
      nextAttemptAt: at,
      lockedAt: null,
      error: clip(error),
      ...(refundAttempt ? { attempts: { decrement: 1 } } : {}),
    },
  });
  return count > 0;
}

/**
 * Writes the model's draft to the version and moves it to PENDING_REVIEW, in
 * one transaction with the job and the activity log.
 *
 * This bypasses VALID_TRANSITIONS on purpose, as starting a translation does:
 * there is no PENDING_TRANSLATION -> PENDING_REVIEW move for a person, because
 * a person submits their own work through IN_PROGRESS. The write is
 * conditional instead: the setting must still be on (read under a share lock,
 * so turning it off waits for this or this waits for it) and the version must
 * still be untouched. Otherwise the draft is discarded and the job says why.
 */
export async function completeAutoTranslation(input: {
  job: { id: string; lockedAt: Date | null; translationProjectId: string; versionId: string };
  content: string;
  model: string;
}): Promise<'written' | 'cancelled' | 'skipped' | 'lost'> {
  const { job } = input;
  return prisma.$transaction(async (tx) => {
    const [project] = await tx.$queryRaw<{ autoTranslate: boolean; autoTranslateChangedById: string | null }[]>`
      SELECT "autoTranslate", "autoTranslateChangedById" FROM "translation_project"
      WHERE "id" = ${job.translationProjectId}
      FOR SHARE`;

    const end = async (status: 'CANCELLED' | 'SKIPPED', error: string) => {
      const { count } = await tx.autoTranslation.updateMany({
        where: heldBy(job),
        data: { status, error, lockedAt: null, finishedAt: new Date() },
      });
      return count > 0;
    };

    if (!project?.autoTranslate) {
      return (await end('CANCELLED', 'Automatic translation was turned off; the draft was discarded.'))
        ? 'cancelled'
        : 'lost';
    }

    const claimed = await tx.autoTranslation.updateMany({
      where: heldBy(job),
      data: {
        status: AutoTranslationStatus.SUCCEEDED,
        machineContent: input.content,
        model: input.model,
        error: null,
        lockedAt: null,
        finishedAt: new Date(),
      },
    });
    if (claimed.count === 0) return 'lost';

    const written = await tx.documentVersion.updateMany({
      where: { id: job.versionId, status: DocumentStatus.PENDING_TRANSLATION },
      data: { content: input.content, status: DocumentStatus.PENDING_REVIEW, version: { increment: 1 } },
    });
    if (written.count === 0) {
      await tx.autoTranslation.update({
        where: { id: job.id },
        data: {
          status: AutoTranslationStatus.SKIPPED,
          machineContent: null,
          model: null,
          error: 'Someone started this version first; the draft was discarded.',
        },
      });
      return 'skipped';
    }

    const requested = await tx.autoTranslation.findUnique({ where: { id: job.id }, select: { requestedById: true } });
    const actorId = requested?.requestedById ?? project.autoTranslateChangedById;
    // ActivityLog needs a person; the one who asked for the draft stands for
    // the model. With that person deleted there is nobody to name.
    if (actorId) {
      await tx.activityLog.create({
        data: { documentVersionId: job.versionId, userId: actorId, action: 'auto_translated', details: { model: input.model } },
      });
    }
    return 'written';
  });
}

// ─── Progress and the summary ────────────────────────────────

/** Counts for the project page, and the failed documents with their errors. */
export async function getAutoTranslationProgress(translationProjectId: string) {
  const groups = await prisma.autoTranslation.groupBy({
    by: ['status'],
    where: { translationProjectId },
    _count: { _all: true },
  });
  const count = (status: AutoTranslationStatus) => groups.find((group) => group.status === status)?._count._all ?? 0;

  const failures = await prisma.autoTranslation.findMany({
    where: { translationProjectId, status: AutoTranslationStatus.FAILED },
    orderBy: { finishedAt: 'desc' },
    take: 50,
    select: {
      id: true,
      error: true,
      finishedAt: true,
      documentVersion: {
        select: { document: { select: { id: true, title: true, slug: true } } },
      },
    },
  });

  return {
    queued: count(AutoTranslationStatus.QUEUED),
    running: count(AutoTranslationStatus.RUNNING),
    succeeded: count(AutoTranslationStatus.SUCCEEDED),
    failed: count(AutoTranslationStatus.FAILED),
    failures: failures.map((failure) => ({
      id: failure.id,
      error: failure.error,
      finishedAt: failure.finishedAt,
      document: failure.documentVersion.document,
    })),
  };
}

/**
 * When the project's queue has drained, claims the right to tell its managers
 * and returns what finished since they were last told. Null while work is
 * still open, when another worker claimed it first, or when nothing finished.
 */
export async function claimDrainSummary(translationProjectId: string) {
  const open = await prisma.autoTranslation.count({
    where: { translationProjectId, status: { in: OPEN_STATUSES } },
  });
  if (open > 0) return null;

  const project = await prisma.translationProject.findUnique({
    where: { id: translationProjectId },
    select: { autoTranslateNotifiedAt: true },
  });
  if (!project) return null;

  const since = project.autoTranslateNotifiedAt;
  const now = new Date();
  const claimed = await prisma.translationProject.updateMany({
    where: { id: translationProjectId, autoTranslateNotifiedAt: since },
    data: { autoTranslateNotifiedAt: now },
  });
  if (claimed.count === 0) return null;

  const finished = { translationProjectId, finishedAt: since ? { gt: since, lte: now } : { lte: now } };
  const [translated, failed] = await Promise.all([
    prisma.autoTranslation.count({ where: { ...finished, status: AutoTranslationStatus.SUCCEEDED } }),
    prisma.autoTranslation.count({ where: { ...finished, status: AutoTranslationStatus.FAILED } }),
  ]);
  if (translated + failed === 0) return null;
  return { translated, failed };
}

/** The AI original of a version, when its current text started as the model's draft. */
export async function getMachineTranslation(documentVersionId: string) {
  return prisma.autoTranslation.findFirst({
    where: { documentVersionId, status: AutoTranslationStatus.SUCCEEDED },
    select: { machineContent: true, model: true, finishedAt: true },
  });
}
