import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentStatus, ProjectRole, Role } from '@/generated/prisma/enums';
import { createAuthorize } from '@/lib/authorize';
import type { SessionUser } from '@/lib/session';
import { createVersionPermissions, isReviewedStatus } from './document-version.permissions';

const admin: SessionUser = { id: 'admin-1', email: 'admin@test.com', name: 'Admin', role: Role.ADMIN };
const translator: SessionUser = { id: 'user-1', email: 'user@test.com', name: 'User', role: Role.USER };

interface Setup {
  user?: SessionUser;
  status?: DocumentStatus;
  languageCode?: string;
  /** The version's last editor. */
  versionUserId?: string | null;
  translationProject?: boolean;
  /** The user's role on the version's language, or null when not on it. */
  languageRole?: ProjectRole | null;
}

/**
 * The real `authorize`, fed a session and the user's role on one language, so
 * these tests exercise the role hierarchy the app uses rather than a stub of it.
 */
function setup({
  user = translator,
  status = DocumentStatus.IN_PROGRESS,
  languageCode = 'cs',
  versionUserId = null,
  translationProject = true,
  languageRole = null,
}: Setup = {}) {
  const asked: unknown[] = [];
  const authorize = createAuthorize({
    requireUser: async () => user,
    getUserRolesInProject: async () => (languageRole ? [languageRole] : []),
    getUserRoleForLanguage: async () => languageRole,
  });
  const permissions = createVersionPermissions({
    getVersion: async (id) =>
      id === 'version-1'
        ? { id, documentId: 'doc-1', languageId: 'lang-1', status, userId: versionUserId }
        : null,
    getLanguage: async () => ({ code: languageCode }),
    getDocument: async () => ({ sourceProject: { id: 'source-1' } }),
    getTranslationProject: async () => (translationProject ? { id: 'tp-1' } : null),
    authorize: async (permission) => {
      asked.push(permission);
      return authorize(permission);
    },
  });
  return { ...permissions, asked, user };
}

describe('isReviewedStatus', () => {
  it('is true only once the text has passed review', () => {
    assert.equal(isReviewedStatus(DocumentStatus.PENDING_TRANSLATION), false);
    assert.equal(isReviewedStatus(DocumentStatus.IN_PROGRESS), false);
    assert.equal(isReviewedStatus(DocumentStatus.PENDING_REVIEW), false);
    assert.equal(isReviewedStatus(DocumentStatus.APPROVED), true);
    assert.equal(isReviewedStatus(DocumentStatus.DEPLOYED), true);
  });
});

describe('assertCanEditDocumentVersion', () => {
  it('lets a translator on the language through the translation project', async () => {
    const { assertCanEditDocumentVersion, asked, user } = setup({ languageRole: ProjectRole.TRANSLATOR });
    await assertCanEditDocumentVersion('version-1', user);
    assert.deepEqual(asked, [{ project: 'tp-1', role: 'translator' }]);
  });

  it('refuses someone who is not on the language', async () => {
    const { assertCanEditDocumentVersion, user } = setup();
    await assert.rejects(assertCanEditDocumentVersion('version-1', user), /Forbidden/);
  });

  it('refuses the last editor once they are removed from the language', async () => {
    const { assertCanEditDocumentVersion, user } = setup({ versionUserId: translator.id, languageRole: null });
    await assert.rejects(assertCanEditDocumentVersion('version-1', user), /Forbidden/);
  });

  it('checks the language itself when no translation project exists', async () => {
    const outsider = setup({ translationProject: false });
    await assert.rejects(outsider.assertCanEditDocumentVersion('version-1', outsider.user), /Forbidden/);
    assert.deepEqual(outsider.asked, [{ language: 'lang-1', role: 'translator' }]);

    const member = setup({ translationProject: false, languageRole: ProjectRole.TRANSLATOR });
    await member.assertCanEditDocumentVersion('version-1', member.user);
  });

  it('lets an administrator through without a language role', async () => {
    const { assertCanEditDocumentVersion, user } = setup({ user: admin });
    await assertCanEditDocumentVersion('version-1', user);
  });

  it('keeps source (English) versions to administrators', async () => {
    const member = setup({ languageCode: 'en', languageRole: ProjectRole.PROJECT_MANAGER });
    await assert.rejects(member.assertCanEditDocumentVersion('version-1', member.user), /Only deployers/);

    const adminSetup = setup({ user: admin, languageCode: 'en' });
    await adminSetup.assertCanEditDocumentVersion('version-1', adminSetup.user);
  });

  it('ignores status, so the audio actions still work on approved and deployed versions', async () => {
    for (const status of [DocumentStatus.APPROVED, DocumentStatus.DEPLOYED]) {
      const { assertCanEditDocumentVersion, user } = setup({ status, languageRole: ProjectRole.TRANSLATOR });
      await assertCanEditDocumentVersion('version-1', user);
    }
  });

  it('reports a missing version', async () => {
    const { assertCanEditDocumentVersion, user } = setup();
    await assert.rejects(assertCanEditDocumentVersion('nope', user), /not found/);
  });
});

describe('assertCanEditDocumentVersionContent', () => {
  it('lets a translator edit a draft and a reviewer edit during review', async () => {
    const drafting = setup({ status: DocumentStatus.IN_PROGRESS, languageRole: ProjectRole.TRANSLATOR });
    await drafting.assertCanEditDocumentVersionContent('version-1', drafting.user);

    const reviewing = setup({ status: DocumentStatus.PENDING_REVIEW, languageRole: ProjectRole.REVIEWER });
    await reviewing.assertCanEditDocumentVersionContent('version-1', reviewing.user);
  });

  it('refuses edits to approved or deployed text, even from the language manager', async () => {
    for (const status of [DocumentStatus.APPROVED, DocumentStatus.DEPLOYED]) {
      const { assertCanEditDocumentVersionContent, user } = setup({
        status,
        languageRole: ProjectRole.PROJECT_MANAGER,
      });
      await assert.rejects(assertCanEditDocumentVersionContent('version-1', user), /Move it back to review/);
    }
  });

  it('still applies the membership rule before the status rule', async () => {
    const { assertCanEditDocumentVersionContent, user } = setup({ status: DocumentStatus.IN_PROGRESS });
    await assert.rejects(assertCanEditDocumentVersionContent('version-1', user), /Forbidden/);
  });

  it('lets an administrator edit at any status', async () => {
    for (const status of [DocumentStatus.APPROVED, DocumentStatus.DEPLOYED]) {
      const { assertCanEditDocumentVersionContent, user } = setup({ user: admin, status });
      await assertCanEditDocumentVersionContent('version-1', user);
    }
  });

  it('leaves the source (English) version to its own admin-only rule', async () => {
    const { assertCanEditDocumentVersionContent, user } = setup({
      user: admin,
      languageCode: 'en',
      status: DocumentStatus.DEPLOYED,
    });
    await assertCanEditDocumentVersionContent('version-1', user);
  });
});

describe('assertCanDeleteDocumentVersion', () => {
  it('lets a translator on the language delete a draft', async () => {
    for (const status of [DocumentStatus.PENDING_TRANSLATION, DocumentStatus.IN_PROGRESS]) {
      const { assertCanDeleteDocumentVersion, user, asked } = setup({ status, languageRole: ProjectRole.TRANSLATOR });
      await assertCanDeleteDocumentVersion('version-1', user);
      assert.deepEqual(asked, [{ project: 'tp-1', role: 'translator' }]);
    }
  });

  it('refuses anyone who is not on the language, even for a draft', async () => {
    const { assertCanDeleteDocumentVersion, user } = setup({ status: DocumentStatus.PENDING_TRANSLATION });
    await assert.rejects(assertCanDeleteDocumentVersion('version-1', user), /Forbidden/);
  });

  it('refuses a translator or reviewer once the version is in review or later', async () => {
    for (const status of [DocumentStatus.PENDING_REVIEW, DocumentStatus.APPROVED, DocumentStatus.DEPLOYED]) {
      for (const languageRole of [ProjectRole.TRANSLATOR, ProjectRole.REVIEWER, ProjectRole.EDITOR]) {
        const { assertCanDeleteDocumentVersion, user } = setup({ status, languageRole });
        await assert.rejects(assertCanDeleteDocumentVersion('version-1', user), /manager/);
      }
    }
  });

  it('lets the language manager and an administrator delete at any status', async () => {
    for (const status of [DocumentStatus.PENDING_REVIEW, DocumentStatus.APPROVED, DocumentStatus.DEPLOYED]) {
      const manager = setup({ status, languageRole: ProjectRole.PROJECT_MANAGER });
      await manager.assertCanDeleteDocumentVersion('version-1', manager.user);
      assert.deepEqual(manager.asked, [
        { project: 'tp-1', role: 'translator' },
        { language: 'lang-1', role: 'manager' },
      ]);

      const adminSetup = setup({ user: admin, status });
      await adminSetup.assertCanDeleteDocumentVersion('version-1', adminSetup.user);
    }
  });
});
