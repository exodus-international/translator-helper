/**
 * The version queries behind starting a translation and applying a
 * suggestion, against the seeded database. Pinned before those two flows are
 * lifted out of their server actions.
 */
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentStatus } from '@/generated/prisma/enums';
import prisma from '@/lib/db';
import { SEEDED_USERS, seededDocument, seededLanguage, seededUser, seededVersion } from '../../../tests/seeded';
import {
  createDocumentVersion,
  getDocumentVersionByDocumentAndLanguage,
  getDocumentVersionById,
  updateDocumentVersion,
  updateDocumentVersionStatus,
} from './document-version.repository';

after(() => prisma.$disconnect());

describe('getDocumentVersionByDocumentAndLanguage', () => {
  it('finds the version the seed made, with its language and translator', async () => {
    const day14 = await seededDocument('ex90-day-14');
    const slovak = await seededLanguage('sk');
    const version = await getDocumentVersionByDocumentAndLanguage(day14.id, slovak.id);
    assert.equal(version?.status, DocumentStatus.PENDING_TRANSLATION);
    assert.equal(version?.version, 1);
    assert.equal(version?.language.code, 'sk');
    assert.equal(version?.document.slug, 'ex90-day-14');
  });

  it('is null for a language the document has not been started in', async () => {
    const reference = await seededDocument('ex90-markdown-reference');
    const croatian = await seededLanguage('hr');
    assert.equal(await getDocumentVersionByDocumentAndLanguage(reference.id, croatian.id), null);
  });
});

describe('createDocumentVersion, updateDocumentVersion and updateDocumentVersionStatus', () => {
  it('creates version 1, bumps the counter on every content write, and moves status only when asked', async () => {
    const reference = await seededDocument('ex90-markdown-reference');
    const croatian = await seededLanguage('hr');
    const translator = await seededUser(SEEDED_USERS.translator);
    const reviewer = await seededUser(SEEDED_USERS.reviewer);

    const created = await createDocumentVersion({
      documentId: reference.id,
      languageId: croatian.id,
      content: '',
      status: DocumentStatus.IN_PROGRESS,
      userId: translator.id,
    });
    try {
      assert.equal(created.version, 1);
      assert.equal(created.status, DocumentStatus.IN_PROGRESS);
      assert.equal(created.user?.id, translator.id);
      assert.equal(created.language.code, 'hr');

      const written = await updateDocumentVersion(created.id, '# Draft', reviewer.id);
      assert.equal(written.content, '# Draft');
      assert.equal(written.version, 2);
      // A content write records who wrote, and leaves the status alone.
      assert.equal(written.user?.id, reviewer.id);
      assert.equal(written.status, DocumentStatus.IN_PROGRESS);

      const moved = await updateDocumentVersionStatus(created.id, DocumentStatus.PENDING_REVIEW);
      assert.equal(moved.status, DocumentStatus.PENDING_REVIEW);
      assert.equal(moved.version, 2);
      assert.equal(moved.reviewer, null);

      const reviewed = await updateDocumentVersionStatus(created.id, DocumentStatus.PENDING_REVIEW, reviewer.id);
      assert.equal(reviewed.reviewer?.id, reviewer.id);
    } finally {
      await prisma.documentVersion.delete({ where: { id: created.id } });
    }
  });

  it('starts at PENDING_TRANSLATION when no status is given', async () => {
    const reference = await seededDocument('ex90-markdown-reference');
    const croatian = await seededLanguage('hr');
    const created = await createDocumentVersion({
      documentId: reference.id,
      languageId: croatian.id,
      content: '',
      userId: null,
    });
    try {
      assert.equal(created.status, DocumentStatus.PENDING_TRANSLATION);
      assert.equal(created.user, null);
    } finally {
      await prisma.documentVersion.delete({ where: { id: created.id } });
    }
  });

  it('refuses a content write to a version that does not exist', async () => {
    const translator = await seededUser(SEEDED_USERS.translator);
    await assert.rejects(updateDocumentVersion('00000000-0000-4000-8000-000000000000', 'x', translator.id), /not found/);
  });
});

describe('getDocumentVersionById', () => {
  it('loads the document, language and the people on the version', async () => {
    const seeded = await seededVersion('ex90-day-3', 'cs');
    const version = await getDocumentVersionById(seeded.id);
    assert.equal(version?.status, DocumentStatus.PENDING_REVIEW);
    assert.equal(version?.document.slug, 'ex90-day-3');
    assert.equal(version?.language.code, 'cs');
    assert.equal(version?.user?.email, SEEDED_USERS.translator);
    assert.equal(version?.reviewer?.email, SEEDED_USERS.reviewer);
  });

  it('is null for an id nothing has', async () => {
    assert.equal(await getDocumentVersionById('00000000-0000-4000-8000-000000000000'), null);
  });
});
