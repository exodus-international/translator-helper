import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Role, ProjectRole } from '@/generated/prisma/enums';
import type { SessionUser } from './session';
import { createAuthorize, type AuthorizeDeps } from './authorize';

// ─── Test fixtures ───────────────────────────────────────────

const adminUser: SessionUser = {
  id: 'admin-1',
  email: 'admin@test.com',
  name: 'Admin',
  role: Role.ADMIN,
};

const regularUser: SessionUser = {
  id: 'user-1',
  email: 'user@test.com',
  name: 'User',
  role: Role.USER,
};

function createDeps(overrides: Partial<AuthorizeDeps> = {}): AuthorizeDeps {
  return {
    requireUser: async () => regularUser,
    getUserRolesInProject: async () => [],
    getUserRoleForLanguage: async () => null,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────

describe('authorize', () => {
  describe('authenticated', () => {
    it('returns user when session exists', async () => {
      const authorize = createAuthorize(createDeps());
      const result = await authorize('authenticated');
      assert.deepStrictEqual(result.user, regularUser);
    });

    it('throws when no session', async () => {
      const authorize = createAuthorize(createDeps({
        requireUser: async () => { throw new Error('Unauthorized'); },
      }));
      await assert.rejects(() => authorize('authenticated'), { message: 'Unauthorized' });
    });
  });

  describe('admin global check', () => {
    it('admin passes admin check', async () => {
      const authorize = createAuthorize(createDeps({ requireUser: async () => adminUser }));
      const result = await authorize('admin');
      assert.equal(result.user.role, Role.ADMIN);
    });

    it('regular user fails admin check', async () => {
      const authorize = createAuthorize(createDeps());
      await assert.rejects(() => authorize('admin'), { message: "Forbidden: requires 'admin' permission" });
    });
  });

  describe('capability checks', () => {
    for (const cap of ['can:deploy', 'can:manage-folders', 'can:manage-languages'] as const) {
      it(`admin passes ${cap}`, async () => {
        const authorize = createAuthorize(createDeps({ requireUser: async () => adminUser }));
        const result = await authorize(cap);
        assert.equal(result.user.role, Role.ADMIN);
      });

      it(`regular user fails ${cap}`, async () => {
        const authorize = createAuthorize(createDeps());
        await assert.rejects(() => authorize(cap), { message: `Forbidden: requires '${cap}' permission` });
      });
    }
  });

  describe('project-scoped single role', () => {
    it('user with REVIEWER role passes reviewer check', async () => {
      const authorize = createAuthorize(createDeps({
        getUserRolesInProject: async () => [ProjectRole.REVIEWER],
      }));
      const result = await authorize({ project: 'proj-1', role: 'reviewer' });
      assert.deepStrictEqual(result.projectRoles, [ProjectRole.REVIEWER]);
    });

    it('user with PROJECT_MANAGER passes reviewer check (hierarchy)', async () => {
      const authorize = createAuthorize(createDeps({
        getUserRolesInProject: async () => [ProjectRole.PROJECT_MANAGER],
      }));
      const result = await authorize({ project: 'proj-1', role: 'reviewer' });
      assert.deepStrictEqual(result.projectRoles, [ProjectRole.PROJECT_MANAGER]);
    });

    it('user with TRANSLATOR fails reviewer check', async () => {
      const authorize = createAuthorize(createDeps({
        getUserRolesInProject: async () => [ProjectRole.TRANSLATOR],
      }));
      await assert.rejects(
        () => authorize({ project: 'proj-1', role: 'reviewer' }),
        { message: "Forbidden: requires 'reviewer' permission in project" },
      );
    });

    it('user with EDITOR passes translator check (hierarchy)', async () => {
      const authorize = createAuthorize(createDeps({
        getUserRolesInProject: async () => [ProjectRole.EDITOR],
      }));
      const result = await authorize({ project: 'proj-1', role: 'translator' });
      assert.deepStrictEqual(result.projectRoles, [ProjectRole.EDITOR]);
    });
  });

  describe('admin bypass for project checks', () => {
    it('admin passes project check without DB query', async () => {
      let dbCalled = false;
      const authorize = createAuthorize(createDeps({
        requireUser: async () => adminUser,
        getUserRolesInProject: async () => { dbCalled = true; return []; },
      }));
      const result = await authorize({ project: 'proj-1', role: 'reviewer' });
      assert.equal(dbCalled, false);
      assert.deepStrictEqual(result.projectRoles, [ProjectRole.PROJECT_MANAGER]);
    });
  });

  describe('non-member rejection', () => {
    it('user with no project roles is denied', async () => {
      const authorize = createAuthorize(createDeps({
        getUserRolesInProject: async () => [],
      }));
      await assert.rejects(
        () => authorize({ project: 'proj-1', role: 'member' }),
        { message: "Forbidden: requires 'member' permission in project" },
      );
    });
  });

  describe('multi-role check', () => {
    it('user with REVIEWER passes roles: [reviewer, translator]', async () => {
      const authorize = createAuthorize(createDeps({
        getUserRolesInProject: async () => [ProjectRole.REVIEWER],
      }));
      const result = await authorize({ project: 'proj-1', roles: ['reviewer', 'translator'] });
      assert.deepStrictEqual(result.projectRoles, [ProjectRole.REVIEWER]);
    });

    it('user with TRANSLATOR passes roles: [reviewer, translator]', async () => {
      const authorize = createAuthorize(createDeps({
        getUserRolesInProject: async () => [ProjectRole.TRANSLATOR],
      }));
      const result = await authorize({ project: 'proj-1', roles: ['reviewer', 'translator'] });
      assert.deepStrictEqual(result.projectRoles, [ProjectRole.TRANSLATOR]);
    });

    it('user with no matching roles fails multi-role check', async () => {
      const authorize = createAuthorize(createDeps({
        getUserRolesInProject: async () => [ProjectRole.TRANSLATOR],
      }));
      await assert.rejects(
        () => authorize({ project: 'proj-1', roles: ['manager', 'editor'] }),
        { message: "Forbidden: requires 'manager or editor' permission in project" },
      );
    });
  });

  describe('language-based access', () => {
    it('the same language role applies to every project in that language', async () => {
      // getUserRolesInProject resolves the role from the project's language, so a
      // Czech Reviewer is a reviewer on every Czech project — including ones created
      // after they were assigned the language.
      const authorize = createAuthorize(createDeps({
        getUserRolesInProject: async () => [ProjectRole.REVIEWER],
      }));
      for (const project of ['czech-exodus', 'czech-lectio', 'czech-brand-new']) {
        const result = await authorize({ project, role: 'reviewer' });
        assert.deepStrictEqual(result.projectRoles, [ProjectRole.REVIEWER]);
      }
    });

    it('a user resolves to at most one role per project', async () => {
      const authorize = createAuthorize(createDeps({
        getUserRolesInProject: async () => [ProjectRole.EDITOR],
      }));
      const result = await authorize({ project: 'proj-1', role: 'reviewer' });
      assert.equal(result.projectRoles?.length, 1);
    });

    it('a user without the project language is denied', async () => {
      const authorize = createAuthorize(createDeps({
        getUserRolesInProject: async () => [],
      }));
      await assert.rejects(
        () => authorize({ project: 'german-exodus', role: 'translator' }),
        { message: "Forbidden: requires 'translator' permission in project" },
      );
    });
  });

  describe('role hierarchy correctness', () => {
    it('PROJECT_MANAGER passes all permission roles', async () => {
      const authorize = createAuthorize(createDeps({
        getUserRolesInProject: async () => [ProjectRole.PROJECT_MANAGER],
      }));
      for (const role of ['manager', 'reviewer', 'editor', 'translator', 'member'] as const) {
        const result = await authorize({ project: 'proj-1', role });
        assert.ok(result.user);
      }
    });

    it('TRANSLATOR only passes translator and member', async () => {
      const authorize = createAuthorize(createDeps({
        getUserRolesInProject: async () => [ProjectRole.TRANSLATOR],
      }));
      // Should pass
      await authorize({ project: 'proj-1', role: 'translator' });
      await authorize({ project: 'proj-1', role: 'member' });
      // Should fail
      await assert.rejects(() => authorize({ project: 'proj-1', role: 'reviewer' }));
      await assert.rejects(() => authorize({ project: 'proj-1', role: 'editor' }));
      await assert.rejects(() => authorize({ project: 'proj-1', role: 'manager' }));
    });
  });
});

// ─── Language-scoped ─────────────────────────────────────────

describe('authorize { language, role }', () => {
  const CROATIAN = 'language-hr';

  it('lets a project manager of the language through a manager check', async () => {
    const authorize = createAuthorize(
      createDeps({ getUserRoleForLanguage: async () => ProjectRole.PROJECT_MANAGER }),
    );

    const result = await authorize({ language: CROATIAN, role: 'manager' });

    assert.deepStrictEqual(result.projectRoles, [ProjectRole.PROJECT_MANAGER]);
  });

  it('refuses a translator a manager check, naming the language scope', async () => {
    const authorize = createAuthorize(createDeps({ getUserRoleForLanguage: async () => ProjectRole.TRANSLATOR }));

    await assert.rejects(() => authorize({ language: CROATIAN, role: 'manager' }), {
      message: "Forbidden: requires 'manager' permission in language",
    });
  });

  it('lets any role on the language pass a member check', async () => {
    for (const role of [ProjectRole.TRANSLATOR, ProjectRole.REVIEWER, ProjectRole.EDITOR, ProjectRole.PROJECT_MANAGER]) {
      const authorize = createAuthorize(createDeps({ getUserRoleForLanguage: async () => role }));
      const result = await authorize({ language: CROATIAN, role: 'member' });
      assert.deepStrictEqual(result.projectRoles, [role]);
    }
  });

  it('refuses someone who is not on the language at all', async () => {
    const authorize = createAuthorize(createDeps({ getUserRoleForLanguage: async () => null }));

    await assert.rejects(() => authorize({ language: CROATIAN, role: 'member' }));
  });

  it('lets an admin through without asking the database', async () => {
    let asked = false;
    const authorize = createAuthorize(
      createDeps({
        requireUser: async () => adminUser,
        getUserRoleForLanguage: async () => {
          asked = true;
          return null;
        },
      }),
    );

    await authorize({ language: CROATIAN, role: 'manager' });

    assert.equal(asked, false);
  });

  it('asks about the language it was given, not a project', async () => {
    const seen: string[] = [];
    const authorize = createAuthorize(
      createDeps({
        getUserRoleForLanguage: async (_userId, languageId) => {
          seen.push(languageId);
          return ProjectRole.PROJECT_MANAGER;
        },
      }),
    );

    await authorize({ language: CROATIAN, role: 'manager' });

    assert.deepStrictEqual(seen, [CROATIAN]);
  });
});
