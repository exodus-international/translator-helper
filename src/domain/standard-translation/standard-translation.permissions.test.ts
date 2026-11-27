import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProjectRole, Role } from '@/generated/prisma/enums';
import { createAuthorize } from '@/lib/authorize';
import type { SessionUser } from '@/lib/session';
import { createEntryPermissions } from './standard-translation.permissions';

const admin: SessionUser = { id: 'admin-1', email: 'admin@test.com', name: 'Admin', role: Role.ADMIN };
const member: SessionUser = { id: 'user-1', email: 'user@test.com', name: 'User', role: Role.USER };

const CZECH = 'lang-cs';
const SLOVAK = 'lang-sk';
const czechEntry = { id: 'entry-cs', languageId: CZECH };

/**
 * The real `authorize`, fed a session and the user's roles by language, so
 * these tests exercise the role hierarchy the app uses rather than a stub of it.
 */
function setup(user: SessionUser, roles: Record<string, ProjectRole> = {}) {
  const asked: unknown[] = [];
  const authorize = createAuthorize({
    requireUser: async () => user,
    getUserRolesInProject: async () => [],
    getUserRoleForLanguage: async (_userId, languageId) => roles[languageId] ?? null,
  });
  const { authorizeEntry } = createEntryPermissions({
    getEntry: async (id) => (id === czechEntry.id ? czechEntry : null),
    authorize: async (permission) => {
      asked.push(permission);
      return authorize(permission);
    },
  });
  return { authorizeEntry, asked };
}

describe('authorizeEntry', () => {
  for (const role of Object.values(ProjectRole)) {
    it(`lets a ${role} of the entry's language change it`, async () => {
      const { authorizeEntry, asked } = setup(member, { [CZECH]: role });
      const { entry, user } = await authorizeEntry(czechEntry.id);
      assert.equal(entry, czechEntry);
      assert.equal(user, member);
      assert.deepEqual(asked, [{ language: CZECH, role: 'member' }]);
    });
  }

  it("refuses a member of another language, asking about the entry's language", async () => {
    const { authorizeEntry, asked } = setup(member, { [SLOVAK]: ProjectRole.PROJECT_MANAGER });
    await assert.rejects(authorizeEntry(czechEntry.id), /Forbidden/);
    assert.deepEqual(asked, [{ language: CZECH, role: 'member' }]);
  });

  it('lets an admin change any language’s entry', async () => {
    const { authorizeEntry } = setup(admin);
    const { entry } = await authorizeEntry(czechEntry.id);
    assert.equal(entry, czechEntry);
  });

  it('says an unknown entry is not found, before asking anything', async () => {
    const { authorizeEntry, asked } = setup(member, { [CZECH]: ProjectRole.TRANSLATOR });
    await assert.rejects(authorizeEntry('missing'), /Standard translation not found/);
    assert.deepEqual(asked, []);
  });
});
