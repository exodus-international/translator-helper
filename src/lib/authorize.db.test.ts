/**
 * `authorize()` with its real queries, against the seeded database.
 *
 * `authorize.test.ts` proves the rules with the queries faked. This proves the
 * decisions the app actually makes for the seeded people: the session is the
 * only thing stood in for, because there is no request to read it from.
 */
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProjectRole } from '@/generated/prisma/enums';
import prisma from '@/lib/db';
import { SEEDED_USERS, seededLanguage, seededTranslationProject, seededUser } from '../../tests/seeded';
import { getUserRoleForLanguage, getUserRolesInProject } from '@/domain/user-language/user-language.repository';
import { createAuthorize } from './authorize';
import type { SessionUser } from './session';

after(() => prisma.$disconnect());

/** `authorize()` as the app builds it, signed in as the seeded person. */
async function authorizeAs(email: string) {
  const user = await seededUser(email);
  const session: SessionUser = { id: user.id, email: user.email, name: user.name, role: user.role };
  return createAuthorize({ requireUser: async () => session, getUserRolesInProject, getUserRoleForLanguage });
}

describe('authorize against the seed', () => {
  it('lets a translator translate in their language and nothing more', async () => {
    const authorize = await authorizeAs(SEEDED_USERS.translator);
    const slovak = (await seededLanguage('sk')).id;

    const granted = await authorize({ language: slovak, role: 'translator' });
    assert.deepEqual(granted.projectRoles, [ProjectRole.TRANSLATOR]);
    await assert.rejects(authorize({ language: slovak, role: 'reviewer' }), /Forbidden/);
    await assert.rejects(authorize({ language: slovak, role: 'manager' }), /Forbidden/);
  });

  it('lets an editor act as reviewer and translator in that language', async () => {
    const authorize = await authorizeAs(SEEDED_USERS.translator);
    const czech = (await seededLanguage('cs')).id;

    await authorize({ language: czech, role: 'reviewer' });
    await authorize({ language: czech, role: 'translator' });
    await assert.rejects(authorize({ language: czech, role: 'manager' }), /Forbidden/);
  });

  it('refuses a language the person is not on at all', async () => {
    const authorize = await authorizeAs(SEEDED_USERS.translator);
    const croatian = (await seededLanguage('hr')).id;
    await assert.rejects(authorize({ language: croatian, role: 'member' }), /Forbidden/);
  });

  it('resolves a project permission through the project language', async () => {
    const authorize = await authorizeAs(SEEDED_USERS.reviewer);
    const slovakExodus = (await seededTranslationProject('exodus90', 'sk')).id;
    const czechExodus = (await seededTranslationProject('exodus90', 'cs')).id;

    await authorize({ project: slovakExodus, role: 'reviewer' });
    await authorize({ project: slovakExodus, roles: ['reviewer', 'translator'] });
    await assert.rejects(authorize({ project: slovakExodus, role: 'manager' }), /Forbidden/);
    await assert.rejects(authorize({ project: czechExodus, role: 'member' }), /Forbidden/);
  });

  it('treats a non-administrator manager as the manager of their language only', async () => {
    const authorize = await authorizeAs(SEEDED_USERS.translator2);
    const german = (await seededLanguage('de')).id;
    const czech = (await seededLanguage('cs')).id;

    const granted = await authorize({ language: german, role: 'manager' });
    assert.deepEqual(granted.projectRoles, [ProjectRole.PROJECT_MANAGER]);
    await assert.rejects(authorize({ language: czech, role: 'member' }), /Forbidden/);
    await assert.rejects(authorize('admin'), /Forbidden/);
  });

  it('lets an administrator into every language and project without a membership', async () => {
    const authorize = await authorizeAs(SEEDED_USERS.admin);
    // The admin is on cs and sk only; Croatian is a language they never joined.
    const croatian = (await seededLanguage('hr')).id;
    const croatianExodus = (await seededTranslationProject('exodus90', 'hr')).id;

    await authorize('admin');
    await authorize('can:manage-folders');
    assert.deepEqual((await authorize({ language: croatian, role: 'manager' })).projectRoles, [
      ProjectRole.PROJECT_MANAGER,
    ]);
    assert.deepEqual((await authorize({ project: croatianExodus, role: 'manager' })).projectRoles, [
      ProjectRole.PROJECT_MANAGER,
    ]);
  });
});
