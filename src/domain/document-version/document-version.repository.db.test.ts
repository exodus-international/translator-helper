/**
 * The version queries behind starting a translation and applying a
 * suggestion, against the seeded database. Pinned before those two flows are
 * lifted out of their server actions.
 */
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentStatus, SuggestionType } from '@/generated/prisma/enums';
import { extractTextAtRange } from '@/lib/text-range';
import prisma from '@/lib/db';
import { SEEDED_USERS, seededDocument, seededLanguage, seededUser, seededVersion } from '../../../tests/seeded';
import {
  claimDocumentVersion,
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

describe('claimDocumentVersion', () => {
  it('hands a waiting version to the translator and moves it to IN_PROGRESS', async () => {
    const day14 = await seededVersion('ex90-day-14', 'sk');
    const translator = await seededUser(SEEDED_USERS.translator);
    assert.equal(day14.status, DocumentStatus.PENDING_TRANSLATION);
    try {
      const claimed = await claimDocumentVersion(day14.id, translator.id);
      assert.equal(claimed.status, DocumentStatus.IN_PROGRESS);
      assert.equal(claimed.user?.id, translator.id);
      assert.equal(claimed.language.code, 'sk');
      // The counter is not a content write, so it does not move.
      assert.equal(claimed.version, day14.version);
    } finally {
      await prisma.documentVersion.update({
        where: { id: day14.id },
        data: { userId: day14.userId, status: day14.status },
      });
    }
  });
});

describe('updateDocumentVersion and the suggestions on the version', () => {
  const text = ['The call came early.', 'Nobody answered it.', 'So it came again.'].join('\n');

  /** A version with one suggestion on "call" (line 1), one on "again" (line 3) and one on no text. */
  async function versionWithSuggestions() {
    const reference = await seededDocument('ex90-markdown-reference');
    const croatian = await seededLanguage('hr');
    const translator = await seededUser(SEEDED_USERS.translator);
    const version = await createDocumentVersion({
      documentId: reference.id,
      languageId: croatian.id,
      content: text,
      status: DocumentStatus.IN_PROGRESS,
      userId: translator.id,
    });
    const suggest = (anchorText: string | null, line: number | null, from: number | null, to: number | null) =>
      prisma.suggestion.create({
        data: {
          documentVersionId: version.id,
          userId: translator.id,
          type: SuggestionType.COMMENT,
          comment: 'A note.',
          version: 1,
          anchorText,
          startLine: line,
          endLine: line,
          startColumn: from,
          endColumn: to,
        },
      });
    const call = await suggest('call', 1, 5, 9);
    const again = await suggest('again', 3, 12, 17);
    const general = await suggest(null, null, null, null);
    return { version, translator, call, again, general };
  }

  /** What the suggestion's range holds in the version's text as stored now. */
  async function held(suggestionId: string) {
    const suggestion = await prisma.suggestion.findUniqueOrThrow({
      where: { id: suggestionId },
      include: { documentVersion: true },
    });
    const { startLine, startColumn, endLine, endColumn } = suggestion;
    if (startLine == null || startColumn == null || endLine == null || endColumn == null) return null;
    return extractTextAtRange(suggestion.documentVersion.content, { startLine, startColumn, endLine, endColumn });
  }

  it('moves each suggestion with the edit, so its range still holds its words', async () => {
    const { version, translator, call, again, general } = await versionWithSuggestions();
    try {
      await updateDocumentVersion(version.id, text.replace('Nobody', 'For a long while\nnobody'), translator.id);
      // The edit is on line 2: line 1 stays, line 3 is now line 4.
      assert.equal((await prisma.suggestion.findUniqueOrThrow({ where: { id: call.id } })).startLine, 1);
      assert.equal((await prisma.suggestion.findUniqueOrThrow({ where: { id: again.id } })).startLine, 4);
      assert.equal(await held(call.id), 'call');
      assert.equal(await held(again.id), 'again');
      assert.equal(await held(general.id), null);
    } finally {
      await prisma.documentVersion.delete({ where: { id: version.id } });
    }
  });

  it('keeps suggestions on their words when two saves arrive at once', async () => {
    const { version, translator, call, again } = await versionWithSuggestions();
    try {
      // An autosave and an applied suggestion, each made from the text as it was.
      await Promise.all([
        updateDocumentVersion(version.id, `A new opening line.\n${text}`, translator.id),
        updateDocumentVersion(version.id, text.replace('early', 'very early'), translator.id),
      ]);
      const stored = await prisma.documentVersion.findUniqueOrThrow({ where: { id: version.id } });
      // Neither write is lost from the counter, whichever text ended up stored.
      assert.equal(stored.version, 3);
      assert.equal(await held(call.id), 'call');
      assert.equal(await held(again.id), 'again');
    } finally {
      await prisma.documentVersion.delete({ where: { id: version.id } });
    }
  });
});
