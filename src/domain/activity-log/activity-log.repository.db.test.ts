/**
 * How edits land in the activity log: a burst of edits by one person merges
 * into one entry, and in the AI workflow that entry keeps the text from before
 * the first edit, so its diff shows the whole burst.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '@/lib/db';
import { SEEDED_USERS, seededUser, seededVersion } from '../../../tests/seeded';
import { coalesceEditLog } from './activity-log.repository';

let versionId: string;
let userId: string;

before(async () => {
  versionId = (await seededVersion('test-ai-xxx-u9own', 'cs')).id;
  userId = (await seededUser(SEEDED_USERS.reviewer)).id;
});

after(async () => {
  await prisma.activityLog.deleteMany({ where: { documentVersionId: versionId, userId, action: 'edited' } });
  await prisma.$disconnect();
});

describe('coalesceEditLog', () => {
  it('merges a burst of edits and keeps the text from before the first one', async () => {
    await prisma.activityLog.deleteMany({ where: { documentVersionId: versionId, userId, action: 'edited' } });

    await coalesceEditLog({ documentVersionId: versionId, userId, details: { version: 2, before: 'a', after: 'b' } });
    const merged = await coalesceEditLog({
      documentVersionId: versionId,
      userId,
      details: { version: 3, before: 'b', after: 'c' },
    });

    const entries = await prisma.activityLog.findMany({ where: { documentVersionId: versionId, userId, action: 'edited' } });
    assert.equal(entries.length, 1);
    assert.deepEqual(merged.details, { version: 3, before: 'a', after: 'c' });
  });
});
