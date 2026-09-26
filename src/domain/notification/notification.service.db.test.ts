/**
 * Who hears about what, against the seeded database.
 *
 * The notification service is 700 lines of Prisma queries that nothing ran
 * outside a request until now. Each test fires one event about a seeded
 * version and reads the inbox rows it produced. Email is not configured in
 * the test environment, so every row is written as SKIPPED for email, which
 * is the branch that matters here: the inbox.
 */
import { after, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentStatus, NotificationEmailStatus, NotificationType, SuggestionStatus, SuggestionType } from '@/generated/prisma/enums';
import prisma from '@/lib/db';
import { SEEDED_USERS, seededUser, seededVersion } from '../../../tests/seeded';
import { getSuggestionsByDocumentVersion } from '../suggestion/suggestion.repository';
import {
  countWaitingEmailRecipients,
  notifyReviewerAssignment,
  notifyStatusChange,
  notifySuggestionAdded,
  notifySuggestionReply,
  notifyTranslatorAssignment,
  runNotificationSweep,
} from './notification.service';

after(() => prisma.$disconnect());
// The seed makes no notifications, so everything in the table is a test's.
afterEach(() => prisma.notification.deleteMany());

async function inboxOf(email: string) {
  const user = await seededUser(email);
  return prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });
}

describe('notifyTranslatorAssignment', () => {
  it('tells the new translator, and the one who lost the work', async () => {
    // Day 14 in Slovak is held by the admin in the seed.
    const version = await seededVersion('ex90-day-14', 'sk');
    const admin2 = await seededUser(SEEDED_USERS.admin2);
    const translator = await seededUser(SEEDED_USERS.translator);

    await notifyTranslatorAssignment({
      versionId: version.id,
      actorId: admin2.id,
      previous: { userId: translator.id, deadline: null },
    });

    const [assigned] = await inboxOf(SEEDED_USERS.admin);
    assert.equal(assigned.type, NotificationType.ASSIGNED_TRANSLATOR);
    assert.equal(assigned.title, 'Translate "Day 14 - The Desert" into Slovak');
    assert.ok(assigned.body?.startsWith('Assigned by Sarah Mitchell.'));
    assert.equal(assigned.url, '/documents/exodus90/ex90-day-14/sk');
    assert.equal(assigned.actorId, admin2.id);
    assert.equal(assigned.emailStatus, NotificationEmailStatus.SKIPPED);

    const [unassigned] = await inboxOf(SEEDED_USERS.translator);
    assert.equal(unassigned.type, NotificationType.UNASSIGNED);
    assert.equal(unassigned.title, '"Day 14 - The Desert" (Slovak) is no longer assigned to you');
  });

  it('tells nobody about their own action', async () => {
    const version = await seededVersion('ex90-day-14', 'sk');
    const admin = await seededUser(SEEDED_USERS.admin);
    await notifyTranslatorAssignment({ versionId: version.id, actorId: admin.id, previous: { userId: null, deadline: null } });
    assert.deepEqual(await inboxOf(SEEDED_USERS.admin), []);
  });

  it('says nothing when the translator and the deadline are unchanged', async () => {
    const version = await seededVersion('ex90-day-14', 'sk');
    const admin2 = await seededUser(SEEDED_USERS.admin2);
    await notifyTranslatorAssignment({
      versionId: version.id,
      actorId: admin2.id,
      previous: { userId: version.userId, deadline: version.deadline },
    });
    assert.equal(await prisma.notification.count(), 0);
  });
});

describe('notifyReviewerAssignment', () => {
  it('tells the reviewer the work is ready when it already waits for review', async () => {
    // Day 3 in Czech: in review, reviewed by the reviewer.
    const version = await seededVersion('ex90-day-3', 'cs');
    const admin = await seededUser(SEEDED_USERS.admin);
    await notifyReviewerAssignment({
      versionId: version.id,
      actorId: admin.id,
      previous: { reviewerId: null, reviewDeadline: null },
    });
    const [row] = await inboxOf(SEEDED_USERS.reviewer);
    assert.equal(row.type, NotificationType.ASSIGNED_REVIEWER);
    assert.equal(row.title, 'Review "Day 3 - Fasting and Freedom" in Czech');
    assert.ok(row.body?.endsWith('It is ready for review now.'));
  });
});

describe('notifyStatusChange', () => {
  it('asks the reviewer to review when a translation is submitted', async () => {
    const version = await seededVersion('ex90-day-3', 'cs');
    const translator = await seededUser(SEEDED_USERS.translator);
    await notifyStatusChange({
      versionId: version.id,
      actorId: translator.id,
      from: DocumentStatus.IN_PROGRESS,
      to: DocumentStatus.PENDING_REVIEW,
    });
    const [row] = await inboxOf(SEEDED_USERS.reviewer);
    assert.equal(row.type, NotificationType.REVIEW_REQUESTED);
    assert.equal(row.title, '"Day 3 - Fasting and Freedom" (Czech) is ready for review');
    assert.ok(row.body?.startsWith('Submitted by Jan Novak.'));
  });

  it('asks the language managers for a reviewer when there is none', async () => {
    // Day 3 in Slovak has a translator and no reviewer; the admin manages Slovak.
    const version = await seededVersion('ex90-day-3', 'sk');
    const translator = await seededUser(SEEDED_USERS.translator);
    await notifyStatusChange({
      versionId: version.id,
      actorId: translator.id,
      from: DocumentStatus.IN_PROGRESS,
      to: DocumentStatus.PENDING_REVIEW,
    });
    const [row] = await inboxOf(SEEDED_USERS.admin);
    assert.equal(row.type, NotificationType.REVIEW_REQUESTED);
    assert.equal(row.title, '"Day 3 - Fasting and Freedom" (Slovak) needs a reviewer');
    // The other manager of nothing Slovak hears nothing.
    assert.deepEqual(await inboxOf(SEEDED_USERS.admin2), []);
  });

  it('tells the translator when changes are requested and when the work is approved', async () => {
    const version = await seededVersion('ex90-day-3', 'cs');
    const reviewer = await seededUser(SEEDED_USERS.reviewer);
    await notifyStatusChange({ versionId: version.id, actorId: reviewer.id, from: DocumentStatus.PENDING_REVIEW, to: DocumentStatus.IN_PROGRESS });
    await notifyStatusChange({ versionId: version.id, actorId: reviewer.id, from: DocumentStatus.PENDING_REVIEW, to: DocumentStatus.APPROVED });
    const rows = await inboxOf(SEEDED_USERS.translator);
    assert.deepEqual(
      rows.map((row) => [row.type, row.title]),
      [
        [NotificationType.CHANGES_REQUESTED, 'Changes requested on "Day 3 - Fasting and Freedom" (Czech)'],
        [NotificationType.TRANSLATION_APPROVED, '"Day 3 - Fasting and Freedom" (Czech) is approved'],
      ],
    );
  });

  it('says nothing about a move nobody needs to hear about', async () => {
    const version = await seededVersion('ex90-day-3', 'cs');
    const admin = await seededUser(SEEDED_USERS.admin);
    await notifyStatusChange({ versionId: version.id, actorId: admin.id, from: DocumentStatus.APPROVED, to: DocumentStatus.DEPLOYED });
    assert.equal(await prisma.notification.count(), 0);
  });
});

describe('suggestions', () => {
  it('tells the translator about a new suggestion, with a link that opens the thread', async () => {
    const version = await seededVersion('ex90-day-3', 'cs');
    const reviewer = await seededUser(SEEDED_USERS.reviewer);
    await notifySuggestionAdded({
      suggestionId: 'thread-1',
      versionId: version.id,
      actorId: reviewer.id,
      type: SuggestionType.CHANGE,
      comment: 'Use the standard term.',
    });
    const [row] = await inboxOf(SEEDED_USERS.translator);
    assert.equal(row.type, NotificationType.SUGGESTION_ADDED);
    assert.equal(row.title, 'New suggestion on "Day 3 - Fasting and Freedom" (Czech)');
    assert.equal(row.body, 'Ivan Horvat: Use the standard term.');
    assert.equal(row.url, '/documents/exodus90/ex90-day-3/cs?thread=thread-1');
  });

  it('tells everyone in a thread about a reply, except whoever wrote it', async () => {
    // The "fasting" thread: opened by the reviewer, replied to by both.
    const version = await seededVersion('ex90-day-3', 'cs');
    const [thread] = await getSuggestionsByDocumentVersion(version.id, { status: SuggestionStatus.OPEN, type: SuggestionType.CHANGE });
    const admin = await seededUser(SEEDED_USERS.admin);

    await notifySuggestionReply({ suggestionId: thread.id, actorId: admin.id, content: 'Settled: use "posteni".' });
    assert.equal((await inboxOf(SEEDED_USERS.reviewer)).length, 1);
    assert.equal((await inboxOf(SEEDED_USERS.translator)).length, 1);
    assert.equal((await inboxOf(SEEDED_USERS.admin)).length, 0);

    await prisma.notification.deleteMany();
    const reviewer = await seededUser(SEEDED_USERS.reviewer);
    await notifySuggestionReply({ suggestionId: thread.id, actorId: reviewer.id, content: 'Agreed.' });
    assert.equal((await inboxOf(SEEDED_USERS.reviewer)).length, 0);
    assert.equal((await inboxOf(SEEDED_USERS.translator)).length, 1);
  });
});

describe('runNotificationSweep', () => {
  it('reminds the translator of a deadline two days out, and never twice for the same deadline', async () => {
    // Day 3 in Czech is due in about three weeks; the sweep is run as if it
    // were two days before that.
    const version = await seededVersion('ex90-day-3', 'cs');
    assert.ok(version.deadline);
    const now = new Date(version.deadline.getTime() - 2 * 24 * 60 * 60 * 1000);

    const first = await runNotificationSweep(now);
    assert.ok('deadlines' in first);
    assert.ok(first.deadlines.created >= 1);

    // Day 3 is in review, so the reminder goes to its reviewer, not its translator.
    const reminders = (await inboxOf(SEEDED_USERS.reviewer)).filter((row) => row.documentVersionId === version.id);
    assert.equal(reminders.length, 1);
    assert.equal(reminders[0].type, NotificationType.DEADLINE_APPROACHING);
    assert.ok(reminders[0].dedupeKey?.startsWith('due-72h:'));
    assert.equal(reminders[0].body, 'Your review is due in less than three days.');

    const second = await runNotificationSweep(now);
    assert.ok('deadlines' in second);
    assert.equal(second.deadlines.created, 0);

    // Without an email transport nothing waits to be sent.
    assert.equal(first.email.sent, 0);
    assert.equal(await countWaitingEmailRecipients(), 0);
  });
});
