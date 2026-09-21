import prisma from '@/lib/db';
import { isEmailConfigured, sendEmail } from '@/lib/email';
import {
  DocumentStatus,
  NotificationEmailStatus,
  NotificationType,
  ProjectRole,
  SuggestionType,
} from '@/generated/prisma/enums';
import { wantsEmail } from './notification.catalog';
import { effectiveDueAt, formatDueDate, reminderFor } from './notification.deadlines';
import { EMAIL_MAX_AGE, EMAILS_PER_RUN, isDigestDue, renderDigestEmail } from './notification.email';
import { getEmailPreferencesFor, insertNotifications } from './notification.repository';

const LOG_PREFIX = '[Notifications]';
const DAY = 24 * 60 * 60 * 1000;

interface NotificationDraft {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  url?: string | null;
  documentVersionId?: string | null;
  actorId?: string | null;
  dedupeKey?: string;
}

// ─── Delivery ────────────────────────────────────────────────

/**
 * Writes notifications to the inbox and queues the ones each recipient wants
 * emailed. Nobody is told about their own action, and one event never reaches
 * the same person twice.
 */
async function deliver(drafts: NotificationDraft[]): Promise<number> {
  const seen = new Set<string>();
  const wanted = drafts.filter((draft) => {
    if (draft.actorId && draft.actorId === draft.userId) return false;
    const key = draft.dedupeKey ?? `${draft.userId}:${draft.type}:${draft.documentVersionId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (wanted.length === 0) return 0;

  const emailOn = isEmailConfigured();
  const preferences = emailOn ? await getEmailPreferencesFor([...new Set(wanted.map((d) => d.userId))]) : new Map();

  return insertNotifications(
    wanted.map((draft) => ({
      userId: draft.userId,
      type: draft.type,
      title: draft.title,
      body: draft.body ?? null,
      url: draft.url ?? null,
      documentVersionId: draft.documentVersionId ?? null,
      actorId: draft.actorId ?? null,
      dedupeKey: draft.dedupeKey ?? null,
      emailStatus:
        emailOn && wantsEmail(draft.type, preferences.get(draft.userId) ?? new Map())
          ? NotificationEmailStatus.PENDING
          : NotificationEmailStatus.SKIPPED,
    })),
  );
}

/**
 * Runs a notification step after the action it describes has already
 * succeeded. A failure here is logged and swallowed: the assignment happened
 * whether or not anyone heard about it.
 */
async function safely(label: string, step: () => Promise<NotificationDraft[]>): Promise<void> {
  try {
    await deliver(await step());
  } catch (error) {
    console.error(`${LOG_PREFIX} ${label} failed:`, error);
  }
}

// ─── Context ─────────────────────────────────────────────────

async function loadVersion(versionId: string) {
  return prisma.documentVersion.findUnique({
    where: { id: versionId },
    select: {
      id: true,
      status: true,
      userId: true,
      reviewerId: true,
      assignedById: true,
      deadline: true,
      reviewDeadline: true,
      languageId: true,
      document: { select: { title: true, slug: true, sourceProject: { select: { identifier: true } } } },
      language: { select: { name: true, code: true } },
      user: { select: { name: true } },
    },
  });
}

type VersionContext = NonNullable<Awaited<ReturnType<typeof loadVersion>>>;

/** `"Day 3" (Croatian)` — how every notification names the work. */
function workName(version: VersionContext): string {
  return `"${version.document.title}" (${version.language.name})`;
}

function versionUrl(version: VersionContext): string | null {
  const project = version.document.sourceProject?.identifier;
  return project ? `/documents/${project}/${version.document.slug}/${version.language.code}` : null;
}

/** The version's editor with one suggestion thread open and in view. */
function threadUrl(version: VersionContext, suggestionId: string): string | null {
  const url = versionUrl(version);
  return url ? `${url}?thread=${suggestionId}` : null;
}

async function nameOf(userId: string | null | undefined): Promise<string> {
  if (!userId) return 'Someone';
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  return user?.name ?? 'Someone';
}

async function languageManagers(languageIds: string[]): Promise<Map<string, string[]>> {
  const rows = await prisma.userLanguage.findMany({
    where: { languageId: { in: languageIds }, role: ProjectRole.PROJECT_MANAGER, user: { banned: false } },
    select: { languageId: true, userId: true },
  });
  const byLanguage = new Map<string, string[]>();
  for (const row of rows) {
    byLanguage.set(row.languageId, [...(byLanguage.get(row.languageId) ?? []), row.userId]);
  }
  return byLanguage;
}

function truncate(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function sameInstant(a: Date | null | undefined, b: Date | null | undefined): boolean {
  return (a?.getTime() ?? null) === (b?.getTime() ?? null);
}

/** The deadline a review is held to: its own, or the version's while it has none. */
function reviewDueDate(version: { reviewDeadline: Date | null; deadline: Date | null }): Date | null {
  return version.reviewDeadline ?? version.deadline;
}

// ─── Events ──────────────────────────────────────────────────

/** After a manager sets, changes or clears a version's translator or deadline. */
export async function notifyTranslatorAssignment(input: {
  versionId: string;
  actorId: string;
  previous: { userId: string | null; deadline: Date | null } | null;
}) {
  await safely('translator assignment', async () => {
    const version = await loadVersion(input.versionId);
    if (!version) return [];
    const actorName = await nameOf(input.actorId);
    const base = { documentVersionId: version.id, actorId: input.actorId, url: versionUrl(version) };
    const due = version.deadline ? ` Due ${formatDueDate(version.deadline)}.` : '';
    const previousUserId = input.previous?.userId ?? null;
    const drafts: NotificationDraft[] = [];

    if (version.userId && version.userId !== previousUserId) {
      drafts.push({
        ...base,
        userId: version.userId,
        type: NotificationType.ASSIGNED_TRANSLATOR,
        title: `Translate "${version.document.title}" into ${version.language.name}`,
        body: `Assigned by ${actorName}.${due}`,
      });
    }

    if (previousUserId && previousUserId !== version.userId) {
      drafts.push({
        ...base,
        userId: previousUserId,
        type: NotificationType.UNASSIGNED,
        title: `${workName(version)} is no longer assigned to you`,
        body: `${actorName} changed the translator.`,
      });
    }

    if (
      version.userId &&
      version.userId === previousUserId &&
      !sameInstant(version.deadline, input.previous?.deadline)
    ) {
      drafts.push({
        ...base,
        userId: version.userId,
        type: NotificationType.DEADLINE_CHANGED,
        title: `New deadline for ${workName(version)}`,
        body: version.deadline
          ? `Your translation is now due ${formatDueDate(version.deadline)}.`
          : `${actorName} removed the deadline.`,
      });
    }

    // Without a review deadline of their own, the reviewer works to this one.
    if (
      version.reviewerId &&
      !version.reviewDeadline &&
      version.reviewerId !== version.userId &&
      !sameInstant(version.deadline, input.previous?.deadline)
    ) {
      drafts.push({
        ...base,
        userId: version.reviewerId,
        type: NotificationType.DEADLINE_CHANGED,
        title: `New deadline for ${workName(version)}`,
        body: version.deadline
          ? `Your review is now due ${formatDueDate(version.deadline)}.`
          : `${actorName} removed the deadline.`,
      });
    }

    return drafts;
  });
}

/** After a reviewer, or the review deadline, is set, changed or cleared. */
export async function notifyReviewerAssignment(input: {
  versionId: string;
  actorId: string;
  previous: { reviewerId: string | null; reviewDeadline: Date | null };
}) {
  await safely('reviewer assignment', async () => {
    const version = await loadVersion(input.versionId);
    if (!version) return [];
    const actorName = await nameOf(input.actorId);
    const base = { documentVersionId: version.id, actorId: input.actorId, url: versionUrl(version) };
    const reviewDue = reviewDueDate(version);
    const drafts: NotificationDraft[] = [];

    if (version.reviewerId && version.reviewerId !== input.previous.reviewerId) {
      const ready = version.status === DocumentStatus.PENDING_REVIEW ? ' It is ready for review now.' : '';
      drafts.push({
        ...base,
        userId: version.reviewerId,
        type: NotificationType.ASSIGNED_REVIEWER,
        title: `Review "${version.document.title}" in ${version.language.name}`,
        body: `Assigned by ${actorName}.${reviewDue ? ` Due ${formatDueDate(reviewDue)}.` : ''}${ready}`,
      });
    }

    if (input.previous.reviewerId && input.previous.reviewerId !== version.reviewerId) {
      drafts.push({
        ...base,
        userId: input.previous.reviewerId,
        type: NotificationType.UNASSIGNED,
        title: `${workName(version)} is no longer yours to review`,
        body: `${actorName} changed the reviewer.`,
      });
    }

    if (
      version.reviewerId &&
      version.reviewerId === input.previous.reviewerId &&
      !sameInstant(version.reviewDeadline, input.previous.reviewDeadline)
    ) {
      drafts.push({
        ...base,
        userId: version.reviewerId,
        type: NotificationType.DEADLINE_CHANGED,
        title: `New review deadline for ${workName(version)}`,
        body: reviewDue ? `Your review is now due ${formatDueDate(reviewDue)}.` : `${actorName} removed the deadline.`,
      });
    }

    return drafts;
  });
}

/** After a version moves between workflow statuses. */
export async function notifyStatusChange(input: {
  versionId: string;
  actorId: string;
  from: DocumentStatus;
  to: DocumentStatus;
}) {
  await safely('status change', async () => {
    const version = await loadVersion(input.versionId);
    if (!version) return [];
    const actorName = await nameOf(input.actorId);
    const base = { documentVersionId: version.id, actorId: input.actorId, url: versionUrl(version) };

    if (input.to === DocumentStatus.PENDING_REVIEW && input.from !== DocumentStatus.APPROVED) {
      if (version.reviewerId) {
        const reviewDue = reviewDueDate(version);
        return [
          {
            ...base,
            userId: version.reviewerId,
            type: NotificationType.REVIEW_REQUESTED,
            title: `${workName(version)} is ready for review`,
            body: `Submitted by ${actorName}.${reviewDue ? ` Review due ${formatDueDate(reviewDue)}.` : ''}`,
          },
        ];
      }
      // Nobody to review it yet: the people who can pick one should know.
      const managers = (await languageManagers([version.languageId])).get(version.languageId) ?? [];
      return managers.map((userId) => ({
        ...base,
        userId,
        type: NotificationType.REVIEW_REQUESTED,
        title: `${workName(version)} needs a reviewer`,
        body: `Submitted by ${actorName} with no reviewer assigned.`,
      }));
    }

    if (input.from === DocumentStatus.PENDING_REVIEW && input.to === DocumentStatus.IN_PROGRESS && version.userId) {
      return [
        {
          ...base,
          userId: version.userId,
          type: NotificationType.CHANGES_REQUESTED,
          title: `Changes requested on ${workName(version)}`,
          body: `${actorName} sent your translation back.`,
        },
      ];
    }

    if (input.from === DocumentStatus.PENDING_REVIEW && input.to === DocumentStatus.APPROVED && version.userId) {
      return [
        {
          ...base,
          userId: version.userId,
          type: NotificationType.TRANSLATION_APPROVED,
          title: `${workName(version)} is approved`,
          body: `Approved by ${actorName}.`,
        },
      ];
    }

    return [];
  });
}

/** After a reviewer leaves a suggestion or comment on a translation. */
export async function notifySuggestionAdded(input: {
  suggestionId: string;
  versionId: string;
  actorId: string;
  type: SuggestionType;
  comment: string | null;
}) {
  await safely('suggestion', async () => {
    const version = await loadVersion(input.versionId);
    if (!version?.userId) return [];
    const actorName = await nameOf(input.actorId);
    const kind = input.type === SuggestionType.CHANGE ? 'suggestion' : 'comment';
    return [
      {
        documentVersionId: version.id,
        actorId: input.actorId,
        url: threadUrl(version, input.suggestionId),
        userId: version.userId,
        type: NotificationType.SUGGESTION_ADDED,
        title: `New ${kind} on ${workName(version)}`,
        body: input.comment ? `${actorName}: ${truncate(input.comment)}` : `From ${actorName}.`,
      },
    ];
  });
}

/** After a reply in a suggestion thread: its author, earlier repliers and the translator hear about it. */
export async function notifySuggestionReply(input: { suggestionId: string; actorId: string; content: string }) {
  await safely('suggestion reply', async () => {
    const suggestion = await prisma.suggestion.findUnique({
      where: { id: input.suggestionId },
      select: { userId: true, documentVersionId: true, replies: { select: { userId: true } } },
    });
    if (!suggestion) return [];
    const version = await loadVersion(suggestion.documentVersionId);
    if (!version) return [];
    const actorName = await nameOf(input.actorId);
    const participants = new Set([suggestion.userId, ...suggestion.replies.map((reply) => reply.userId)]);
    if (version.userId) participants.add(version.userId);

    return [...participants].map((userId) => ({
      documentVersionId: version.id,
      actorId: input.actorId,
      url: threadUrl(version, input.suggestionId),
      userId,
      type: NotificationType.SUGGESTION_REPLY,
      title: `New reply on ${workName(version)}`,
      body: `${actorName}: ${truncate(input.content)}`,
    }));
  });
}

// ─── Deadline sweep ──────────────────────────────────────────

const deadlineSelect = {
  id: true,
  status: true,
  userId: true,
  reviewerId: true,
  assignedById: true,
  deadline: true,
  reviewDeadline: true,
  languageId: true,
  document: { select: { title: true, slug: true, sourceProject: { select: { identifier: true } } } },
  language: { select: { name: true, code: true } },
  user: { select: { name: true } },
  reviewer: { select: { name: true } },
} as const;

interface StageDeadline {
  version: VersionContext & { reviewer: { name: string } | null };
  stage: 'translation' | 'review';
  assigneeId: string;
  assigneeName: string;
  deadline: Date;
}

/**
 * Creates the reminders every open deadline calls for right now: approaching,
 * overdue for the assignee, and overdue escalations for whoever assigned the
 * work and the language's project managers. Each reminder carries a dedupe key
 * naming its deadline, so a rerun creates nothing new and a moved deadline
 * starts its reminders over.
 */
async function sweepDeadlines(now = new Date()): Promise<{ checked: number; created: number }> {
  // Wide enough for a bare date (due at the end of its day) three days out,
  // and for weekly overdue reminders on work up to three months late.
  const window = { gte: new Date(now.getTime() - 90 * DAY), lte: new Date(now.getTime() + 4 * DAY) };

  const [translating, reviewing] = await Promise.all([
    prisma.documentVersion.findMany({
      where: {
        status: { in: [DocumentStatus.PENDING_TRANSLATION, DocumentStatus.IN_PROGRESS] },
        userId: { not: null },
        deadline: window,
      },
      select: deadlineSelect,
    }),
    prisma.documentVersion.findMany({
      where: {
        status: DocumentStatus.PENDING_REVIEW,
        reviewerId: { not: null },
        OR: [{ reviewDeadline: window }, { reviewDeadline: null, deadline: window }],
      },
      select: deadlineSelect,
    }),
  ]);

  const stages: StageDeadline[] = [
    ...translating.map((version) => ({
      version,
      stage: 'translation' as const,
      assigneeId: version.userId!,
      assigneeName: version.user?.name ?? 'the translator',
      deadline: version.deadline!,
    })),
    ...reviewing.map((version) => ({
      version,
      stage: 'review' as const,
      assigneeId: version.reviewerId!,
      assigneeName: version.reviewer?.name ?? 'the reviewer',
      deadline: reviewDueDate(version)!,
    })),
  ];

  const managers = await languageManagers([...new Set(stages.map((s) => s.version.languageId))]);
  const drafts: NotificationDraft[] = [];

  for (const { version, stage, assigneeId, assigneeName, deadline } of stages) {
    const dueAt = effectiveDueAt(deadline);
    const reminder = reminderFor(now, dueAt);
    if (!reminder) continue;

    const key = `${version.id}:${stage}:${deadline.toISOString()}`;
    const base = { documentVersionId: version.id, url: versionUrl(version) };
    const dueDate = formatDueDate(deadline);
    const work = stage === 'translation' ? 'translation' : 'review';

    if (reminder.kind === 'approaching') {
      drafts.push({
        ...base,
        userId: assigneeId,
        type: NotificationType.DEADLINE_APPROACHING,
        title: `${workName(version)} is due ${dueDate}`,
        body:
          reminder.window === '72h'
            ? `Your ${work} is due in less than three days.`
            : `Your ${work} is due in less than a day.`,
        dedupeKey: `due-${reminder.window}:${assigneeId}:${key}`,
      });
      continue;
    }

    if (reminder.remind) {
      drafts.push({
        ...base,
        userId: assigneeId,
        type: NotificationType.DEADLINE_PASSED,
        title: `${workName(version)} is overdue`,
        body:
          reminder.daysOverdue === 0
            ? `Your ${work} was due ${dueDate}.`
            : `Your ${work} was due ${dueDate}, ${reminder.daysOverdue} day${reminder.daysOverdue === 1 ? '' : 's'} ago.`,
        dedupeKey: `overdue-${reminder.daysOverdue}:${assigneeId}:${key}`,
      });
    }

    if (reminder.escalate) {
      const watchers = new Set(managers.get(version.languageId) ?? []);
      if (version.assignedById) watchers.add(version.assignedById);
      watchers.delete(assigneeId);
      for (const userId of watchers) {
        drafts.push({
          ...base,
          userId,
          type: NotificationType.DEADLINE_ESCALATION,
          title: `${workName(version)} is overdue`,
          body: `The ${work}, assigned to ${assigneeName}, was due ${dueDate}.`,
          dedupeKey: `escalation-${reminder.daysOverdue}:${userId}:${key}`,
        });
      }
    }
  }

  const created = await deliver(drafts);
  return { checked: stages.length, created };
}

// ─── Email sweep ─────────────────────────────────────────────

const MAX_ATTEMPTS = 5;
/** Resend's default rate limit is a few requests a second. */
const SEND_SPACING_MS = 600;

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || 'http://localhost:3000';
}

interface EmailSweepResult {
  sent: number;
  failed: number;
  waiting: number;
  dropped: number;
  rateLimited: boolean;
}

/**
 * Sends each person their daily digest once noon (CET) has passed. What
 * cannot go out now stays pending for the next run; what keeps failing, or has
 * waited 36 hours, is given up on.
 */
async function sendPendingEmails(now = new Date(), { ignoreSchedule = false } = {}): Promise<EmailSweepResult> {
  const result: EmailSweepResult = { sent: 0, failed: 0, waiting: 0, dropped: 0, rateLimited: false };

  if (!isEmailConfigured()) {
    const { count } = await prisma.notification.updateMany({
      where: { emailStatus: NotificationEmailStatus.PENDING },
      data: { emailStatus: NotificationEmailStatus.SKIPPED, emailError: 'Email is not configured' },
    });
    result.dropped = count;
    return result;
  }

  const stale = await prisma.notification.updateMany({
    where: { emailStatus: NotificationEmailStatus.PENDING, createdAt: { lt: new Date(now.getTime() - EMAIL_MAX_AGE) } },
    data: { emailStatus: NotificationEmailStatus.SKIPPED, emailError: 'Too old to email' },
  });
  result.dropped = stale.count;

  const pending = await prisma.notification.findMany({
    where: { emailStatus: NotificationEmailStatus.PENDING },
    select: {
      id: true,
      userId: true,
      type: true,
      title: true,
      body: true,
      url: true,
      createdAt: true,
      emailAttempts: true,
      user: { select: { email: true, name: true, banned: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const byUser = new Map<string, typeof pending>();
  for (const row of pending) {
    byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);
  }

  let sentThisRun = 0;
  for (const rows of byUser.values()) {
    if (
      !ignoreSchedule &&
      !isDigestDue(
        rows.map((row) => row.createdAt),
        now,
      )
    ) {
      result.waiting += rows.length;
      continue;
    }
    const { user } = rows[0];

    if (user.banned) {
      await prisma.notification.updateMany({
        where: { id: { in: rows.map((row) => row.id) }, emailStatus: NotificationEmailStatus.PENDING },
        data: { emailStatus: NotificationEmailStatus.SKIPPED, emailError: 'User is banned' },
      });
      continue;
    }

    if (sentThisRun >= EMAILS_PER_RUN) {
      result.waiting += rows.length;
      continue;
    }
    if (sentThisRun > 0) await new Promise((resolve) => setTimeout(resolve, SEND_SPACING_MS));

    // The run is slow on purpose, so some of these may have been read in the
    // app since they were loaded, which cancels their email. Only what is still
    // pending goes out, and every update below is conditioned on it staying so.
    const stillPending = new Set(
      (
        await prisma.notification.findMany({
          where: { id: { in: rows.map((row) => row.id) }, emailStatus: NotificationEmailStatus.PENDING },
          select: { id: true },
        })
      ).map((row) => row.id),
    );
    const live = rows.filter((row) => stillPending.has(row.id));
    if (live.length === 0) continue;
    const ids = live.map((row) => row.id);
    const pendingIds = { id: { in: ids }, emailStatus: NotificationEmailStatus.PENDING };

    const outcome = await sendEmail({ to: user.email, ...renderDigestEmail(user.name, live, appUrl()) });
    sentThisRun++;

    if (outcome.ok) {
      await prisma.notification.updateMany({
        where: pendingIds,
        data: { emailStatus: NotificationEmailStatus.SENT, emailSentAt: new Date(), emailError: null },
      });
      result.sent += live.length;
      continue;
    }

    if (outcome.rateLimited) {
      // Out of quota for now: nothing else will get through this run either.
      console.warn(`${LOG_PREFIX} Email rate limited; leaving the rest for the next sweep: ${outcome.error}`);
      result.rateLimited = true;
      result.waiting += live.length;
      break;
    }

    const attempts = Math.max(...live.map((row) => row.emailAttempts)) + 1;
    const giveUp = !outcome.retryable || attempts >= MAX_ATTEMPTS;
    console.error(`${LOG_PREFIX} Email to user ${rows[0].userId} failed (attempt ${attempts}): ${outcome.error}`);
    await prisma.notification.updateMany({
      where: pendingIds,
      data: {
        emailAttempts: attempts,
        emailError: outcome.error,
        ...(giveUp ? { emailStatus: NotificationEmailStatus.FAILED } : {}),
      },
    });
    if (giveUp) result.failed += live.length;
    else result.waiting += live.length;
  }

  return result;
}

/** Arbitrary, fixed: identifies the notification sweep's advisory lock. */
const SWEEP_LOCK_KEY = 7_140_211;

/**
 * Runs `work` only if no other sweep is running. Overlapping runs would email
 * the same digest twice, so a run that finds another one still going does
 * nothing.
 */
async function withSweepLock<T>(work: () => Promise<T>) {
  return prisma.$transaction(
    async (tx) => {
      const [{ locked }] = await tx.$queryRaw<
        { locked: boolean }[]
      >`SELECT pg_try_advisory_xact_lock(${SWEEP_LOCK_KEY}) AS locked`;
      if (!locked) return { skipped: 'another sweep is running' as const };
      return work();
    },
    // The lock lives as long as this transaction; sending a run's worth of
    // spaced-out emails takes a while.
    { timeout: 5 * 60 * 1000, maxWait: 10 * 1000 },
  );
}

/**
 * One scheduled run: reminders first, so a reminder created now can make this
 * run's digest when it runs at noon.
 */
export async function runNotificationSweep(now = new Date()) {
  return withSweepLock(async () => {
    const deadlines = await sweepDeadlines(now);
    const email = await sendPendingEmails(now);
    return { deadlines, email };
  });
}

/**
 * Sends everyone's waiting digest now instead of at noon, for an admin who
 * needs it out sooner. The per-run limit still applies; whatever it leaves
 * goes out on the next sweep after noon.
 */
export async function sendWaitingEmailsNow() {
  return withSweepLock(async () => ({ email: await sendPendingEmails(new Date(), { ignoreSchedule: true }) }));
}

/** How many people have an email waiting, for the admin's confirmation. */
export async function countWaitingEmailRecipients() {
  const recipients = await prisma.notification.groupBy({
    by: ['userId'],
    where: { emailStatus: NotificationEmailStatus.PENDING },
  });
  return recipients.length;
}
