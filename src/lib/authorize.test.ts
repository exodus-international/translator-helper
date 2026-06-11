import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Role, ProjectRole } from '@prisma/client';
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
    isUserArchived: async () => false,
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

  describe('archived user', () => {
    it('rejects archived user regardless of permission', async () => {
      const authorize = createAuthorize(createDeps({
        requireUser: async () => adminUser,
        isUserArchived: async () => true,
      }));
      await assert.rejects(() => authorize('authenticated'), {
        message: 'Your account has been archived. Please contact an administrator.',
      });
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
