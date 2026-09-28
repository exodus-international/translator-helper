/**
 * The suggestion queries behind applying, dismissing and reopening feedback,
 * against the seeded database. Pinned before the apply flow is lifted out of
 * its server action.
 */
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SuggestionStatus, SuggestionType } from '@/generated/prisma/enums';
import prisma from '@/lib/db';
import { SEEDED_USERS, seededUser, seededVersion } from '../../../tests/seeded';
import {
  countOpenSuggestions,
  createSuggestion,
  createSuggestionReply,
  getSuggestionById,
  getSuggestionsByDocumentVersion,
  updateSuggestionStatus,
} from './suggestion.repository';

after(() => prisma.$disconnect());

describe('countOpenSuggestions', () => {
  it('counts only what is still open', async () => {
    // Day 3 in Czech has two open threads and one applied change.
    const day3 = await seededVersion('ex90-day-3', 'cs');
    assert.equal(await countOpenSuggestions(day3.id), 2);
  });

  it('is zero once everything is applied or dismissed', async () => {
    const day2 = await seededVersion('ex90-day-2', 'cs');
    assert.equal(await countOpenSuggestions(day2.id), 0);
  });
});

describe('getSuggestionsByDocumentVersion', () => {
  it('returns every thread, newest first, with its author and replies', async () => {
    const day3 = await seededVersion('ex90-day-3', 'cs');
    const all = await getSuggestionsByDocumentVersion(day3.id);
    assert.equal(all.length, 3);
    const fasting = all.find((suggestion) => suggestion.proposedText === 'posteni');
    assert.equal(fasting?.user.email, SEEDED_USERS.reviewer);
    assert.equal(fasting?.replies.length, 3);
    // Replies read as a conversation: oldest first.
    assert.equal(fasting?.replies[0].content, 'I used "pust" intentionally — it has a broader meaning.');
  });

  it('narrows by status, by type and by author', async () => {
    const day3 = await seededVersion('ex90-day-3', 'cs');
    const reviewer = await seededUser(SEEDED_USERS.reviewer);
    assert.equal((await getSuggestionsByDocumentVersion(day3.id, { status: SuggestionStatus.OPEN })).length, 2);
    assert.equal((await getSuggestionsByDocumentVersion(day3.id, { type: SuggestionType.CHANGE })).length, 2);
    assert.equal((await getSuggestionsByDocumentVersion(day3.id, { userId: reviewer.id })).length, 2);
    assert.equal((await getSuggestionsByDocumentVersion(day3.id, { status: 'ALL', type: 'ALL' })).length, 3);
  });
});

describe('getSuggestionById', () => {
  it('brings the text of the version it is about, for applying a change', async () => {
    const day3 = await seededVersion('ex90-day-3', 'cs');
    const [open] = await getSuggestionsByDocumentVersion(day3.id, { status: SuggestionStatus.OPEN, type: SuggestionType.CHANGE });
    const suggestion = await getSuggestionById(open.id);
    assert.equal(suggestion?.documentVersion.id, day3.id);
    assert.equal(typeof suggestion?.documentVersion.content, 'string');
    assert.equal(suggestion?.documentVersion.version, 3);
    assert.deepEqual(
      [suggestion?.startLine, suggestion?.startColumn, suggestion?.endLine, suggestion?.endColumn],
      [4, 1, 4, 25],
    );
  });

  it('is null for an id nothing has', async () => {
    assert.equal(await getSuggestionById('00000000-0000-4000-8000-000000000000'), null);
  });
});

describe('updateSuggestionStatus', () => {
  it('records the text a change replaced, the reason for a dismissal, and clears the reason on reopen', async () => {
    const day14 = await seededVersion('ex90-day-14', 'cs');
    const reviewer = await seededUser(SEEDED_USERS.reviewer);
    const translator = await seededUser(SEEDED_USERS.translator);
    const created = await createSuggestion({
      documentVersionId: day14.id,
      userId: reviewer.id,
      type: SuggestionType.CHANGE,
      comment: 'Scratch change for the repository test.',
      proposedText: 'new',
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 2,
      version: day14.version,
    });
    try {
      assert.equal(created.status, SuggestionStatus.OPEN);
      assert.equal(await countOpenSuggestions(day14.id), 1);

      const applied = await updateSuggestionStatus(created.id, SuggestionStatus.APPLIED, null, 'old');
      assert.equal(applied.status, SuggestionStatus.APPLIED);
      assert.equal(applied.originalText, 'old');
      assert.equal(await countOpenSuggestions(day14.id), 0);

      const dismissed = await updateSuggestionStatus(created.id, SuggestionStatus.DISMISSED, 'Not needed');
      assert.equal(dismissed.dismissedReason, 'Not needed');
      // The original text is kept when the write says nothing about it.
      assert.equal(dismissed.originalText, 'old');

      const reopened = await updateSuggestionStatus(created.id, SuggestionStatus.OPEN);
      assert.equal(reopened.status, SuggestionStatus.OPEN);
      assert.equal(reopened.dismissedReason, null);

      const reply = await createSuggestionReply({ suggestionId: created.id, userId: translator.id, content: 'Seen.' });
      assert.equal(reply.user.email, SEEDED_USERS.translator);
      assert.equal((await getSuggestionById(created.id))?.replies.length, 1);
    } finally {
      await prisma.suggestionReply.deleteMany({ where: { suggestionId: created.id } });
      await prisma.suggestion.delete({ where: { id: created.id } });
    }
  });
});
