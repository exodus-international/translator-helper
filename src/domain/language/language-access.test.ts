import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProjectRole } from '@/generated/prisma/enums';
import {
  canAdministerLanguages,
  canViewLanguage,
  resolveLanguageViewer,
  visibleLanguages,
} from './language-access';

const HR = { id: 'hr-id', code: 'hr' };
const CS = { id: 'cs-id', code: 'cs' };
const DE = { id: 'de-id', code: 'de' };
const ALL = [HR, CS, DE];

const manager = (...languageIds: string[]) =>
  resolveLanguageViewer({
    isAdmin: false,
    memberships: languageIds.map((languageId) => ({ languageId, role: ProjectRole.PROJECT_MANAGER })),
  });

describe('resolveLanguageViewer', () => {
  it('reads an admin as an admin whatever they are a member of', () => {
    assert.deepEqual(resolveLanguageViewer({ isAdmin: true, memberships: [] }), { kind: 'admin' });
    assert.deepEqual(
      resolveLanguageViewer({
        isAdmin: true,
        memberships: [{ languageId: HR.id, role: ProjectRole.TRANSLATOR }],
      }),
      { kind: 'admin' },
    );
  });

  it('reads a manager by the languages they manage', () => {
    assert.deepEqual(manager(HR.id, DE.id), { kind: 'manager', languageIds: [HR.id, DE.id] });
  });

  it('is nobody when the only memberships are other roles', () => {
    // A reviewer or translator has no business on the language pages: the team
    // and the configuration are decisions made about them, not by them.
    for (const role of [ProjectRole.TRANSLATOR, ProjectRole.REVIEWER, ProjectRole.EDITOR]) {
      assert.deepEqual(resolveLanguageViewer({ isAdmin: false, memberships: [{ languageId: HR.id, role }] }), {
        kind: 'none',
      });
    }
  });

  it('counts only the languages managed, not the ones merely joined', () => {
    const viewer = resolveLanguageViewer({
      isAdmin: false,
      memberships: [
        { languageId: HR.id, role: ProjectRole.PROJECT_MANAGER },
        { languageId: CS.id, role: ProjectRole.REVIEWER },
      ],
    });

    assert.deepEqual(viewer, { kind: 'manager', languageIds: [HR.id] });
  });
});

describe('visibleLanguages', () => {
  it('shows an admin everything', () => {
    assert.deepEqual(visibleLanguages({ kind: 'admin' }, ALL), ALL);
  });

  it('shows a manager only what they manage', () => {
    assert.deepEqual(visibleLanguages(manager(CS.id), ALL), [CS]);
  });

  it('shows nobody nothing', () => {
    assert.deepEqual(visibleLanguages({ kind: 'none' }, ALL), []);
  });
});

describe('canViewLanguage', () => {
  it('lets a manager into the language they manage and no other', () => {
    const viewer = manager(HR.id);

    assert.equal(canViewLanguage(viewer, HR.id), true);
    assert.equal(canViewLanguage(viewer, CS.id), false);
  });

  it('lets an admin into any language', () => {
    assert.equal(canViewLanguage({ kind: 'admin' }, 'anything'), true);
  });

  it('keeps everyone else out', () => {
    assert.equal(canViewLanguage({ kind: 'none' }, HR.id), false);
  });
});

describe('canAdministerLanguages', () => {
  it('is the admin flag, not the manager role', () => {
    // Branch, voice, code and deletion decide what the app does with a
    // language, and getting one wrong breaks something outside it.
    assert.equal(canAdministerLanguages({ kind: 'admin' }), true);
    assert.equal(canAdministerLanguages(manager(HR.id)), false);
    assert.equal(canAdministerLanguages({ kind: 'none' }), false);
  });
});
