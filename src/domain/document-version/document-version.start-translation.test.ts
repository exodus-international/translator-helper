import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentStatus } from '@/generated/prisma/enums';
import { createStartTranslation, type StartTranslationDeps } from './document-version.start-translation';

type Version = { id: string; userId: string | null; status: DocumentStatus; language: { name: string } };
type Call = { fn: string; args: unknown[] };

const slovak = { name: 'Slovak' };

function fakeDeps(existing: Version | null) {
  const calls: Call[] = [];
  const deps: StartTranslationDeps<Version> = {
    findVersion: async () => existing,
    claimVersion: async (versionId, userId) => {
      calls.push({ fn: 'claimVersion', args: [versionId, userId] });
      return { id: versionId, userId, status: DocumentStatus.IN_PROGRESS, language: slovak };
    },
    createVersion: async (data) => {
      calls.push({ fn: 'createVersion', args: [data] });
      return { id: 'version-new', userId: data.userId, status: data.status, language: slovak };
    },
    log: async (entry) => {
      calls.push({ fn: `log:${entry.action}`, args: [entry.details] });
    },
  };
  return { deps, calls, startTranslation: createStartTranslation(deps) };
}

const input = { documentId: 'doc-1', languageId: 'lang-sk', content: '', actorId: 'me' };

describe('startTranslation', () => {
  it('creates the first version in the language, in progress and assigned to the starter', async () => {
    const { startTranslation, calls } = fakeDeps(null);
    const version = await startTranslation(input);
    assert.equal(version.id, 'version-new');
    assert.deepEqual(calls, [
      {
        fn: 'createVersion',
        args: [{ documentId: 'doc-1', languageId: 'lang-sk', content: '', status: DocumentStatus.IN_PROGRESS, userId: 'me' }],
      },
      { fn: 'log:assigned_translation', args: [{ language: 'Slovak' }] },
    ]);
  });

  it('claims an unassigned waiting version and records where it came from', async () => {
    const waiting: Version = { id: 'version-1', userId: null, status: DocumentStatus.PENDING_TRANSLATION, language: slovak };
    const { startTranslation, calls } = fakeDeps(waiting);
    const version = await startTranslation(input);
    assert.equal(version.status, DocumentStatus.IN_PROGRESS);
    assert.deepEqual(calls, [
      { fn: 'claimVersion', args: ['version-1', 'me'] },
      { fn: 'log:started_translation', args: [{ language: 'Slovak', progress: 'PENDING_TRANSLATION -> IN_PROGRESS' }] },
    ]);
  });

  it('re-claims a version the starter already holds from any other status', async () => {
    const mine: Version = { id: 'version-1', userId: 'me', status: DocumentStatus.PENDING_REVIEW, language: slovak };
    const { startTranslation, calls } = fakeDeps(mine);
    await startTranslation(input);
    assert.equal(calls[0].fn, 'claimVersion');
  });

  it('hands back the version untouched when the starter is already translating it', async () => {
    const mine: Version = { id: 'version-1', userId: 'me', status: DocumentStatus.IN_PROGRESS, language: slovak };
    const { startTranslation, calls } = fakeDeps(mine);
    const version = await startTranslation(input);
    assert.equal(version, mine);
    assert.deepEqual(calls, []);
  });

  it('refuses a version reserved by someone else, whatever its status', async () => {
    const theirs: Version = { id: 'version-1', userId: 'them', status: DocumentStatus.PENDING_TRANSLATION, language: slovak };
    const { startTranslation, calls } = fakeDeps(theirs);
    await assert.rejects(startTranslation(input), /assigned to another user/);
    assert.deepEqual(calls, []);
  });

  it('refuses an in-progress version that nobody holds, as it always has', async () => {
    // Kept as it was: an in-progress version with no translator is not
    // claimable through this path, only through assignment.
    const orphan: Version = { id: 'version-1', userId: null, status: DocumentStatus.IN_PROGRESS, language: slovak };
    const { startTranslation, calls } = fakeDeps(orphan);
    await assert.rejects(startTranslation(input), /already assigned to another user/);
    assert.deepEqual(calls, []);
  });
});
