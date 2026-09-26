/**
 * The queries every authorization decision reads, against the seeded database.
 *
 * `authorize()` is unit-tested with these functions faked. This is the other
 * half: that the real queries answer the way the fakes assumed, for the people
 * the seed creates.
 */
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProjectRole } from '@/generated/prisma/enums';
import prisma from '@/lib/db';
import { SEEDED_USERS, seededLanguage, seededSourceProject, seededTranslationProject, seededUser } from '../../../tests/seeded';
import {
  countManagedLanguages,
  countUserTargetLanguages,
  getUserRoleForLanguage,
  getUserRolesInProject,
  isUserMemberOfSourceProject,
  isUserProjectManagerForSourceProject,
  listLanguageMembers,
  removeUserFromLanguage,
  setUserLanguageRole,
} from './user-language.repository';

after(() => prisma.$disconnect());

describe('getUserRoleForLanguage', () => {
  it('returns the role the seed gave the translator on each language', async () => {
    const translator = await seededUser(SEEDED_USERS.translator);
    assert.equal(await getUserRoleForLanguage(translator.id, (await seededLanguage('cs')).id), ProjectRole.EDITOR);
    assert.equal(await getUserRoleForLanguage(translator.id, (await seededLanguage('sk')).id), ProjectRole.TRANSLATOR);
  });

  it('returns null for a language the person is not on', async () => {
    const translator = await seededUser(SEEDED_USERS.translator);
    assert.equal(await getUserRoleForLanguage(translator.id, (await seededLanguage('hr')).id), null);
  });

  it('sees the non-administrator manager the seed promotes on German', async () => {
    const manager = await seededUser(SEEDED_USERS.translator2);
    assert.equal(await getUserRoleForLanguage(manager.id, (await seededLanguage('de')).id), ProjectRole.PROJECT_MANAGER);
  });
});

describe('getUserRolesInProject', () => {
  it('resolves a project role through the language of the project', async () => {
    const reviewer = await seededUser(SEEDED_USERS.reviewer);
    const slovakExodus = await seededTranslationProject('exodus90', 'sk');
    assert.deepEqual(await getUserRolesInProject(reviewer.id, slovakExodus.id), [ProjectRole.REVIEWER]);
  });

  it('gives the same role on every project in that language', async () => {
    const reviewer = await seededUser(SEEDED_USERS.reviewer);
    const slovakLent = await seededTranslationProject('lent2026', 'sk');
    assert.deepEqual(await getUserRolesInProject(reviewer.id, slovakLent.id), [ProjectRole.REVIEWER]);
  });

  it('returns nothing for a project in a language the person is not on', async () => {
    const reviewer = await seededUser(SEEDED_USERS.reviewer);
    const czechExodus = await seededTranslationProject('exodus90', 'cs');
    assert.deepEqual(await getUserRolesInProject(reviewer.id, czechExodus.id), []);
  });
});

describe('source project membership', () => {
  it('counts anyone on any of the project languages as a member', async () => {
    const reviewer = await seededUser(SEEDED_USERS.reviewer);
    const exodus = await seededSourceProject('exodus90');
    assert.equal(await isUserMemberOfSourceProject(reviewer.id, exodus.id), true);
  });

  it('does not count someone whose languages have no project under it', async () => {
    // The seed pairs every source project with every target language, so the
    // only way to be outside one is a project that has no languages at all.
    const reviewer = await seededUser(SEEDED_USERS.reviewer);
    const empty = await prisma.sourceProject.create({
      data: { name: 'Empty project', slug: 'db-test-empty', repositoryDirectory: null },
    });
    try {
      assert.equal(await isUserMemberOfSourceProject(reviewer.id, empty.id), false);
      assert.equal(await isUserProjectManagerForSourceProject(reviewer.id, empty.id), false);
    } finally {
      await prisma.sourceProject.delete({ where: { id: empty.id } });
    }
  });

  it('recognises a manager of one of the project languages', async () => {
    const admin = await seededUser(SEEDED_USERS.admin);
    const exodus = await seededSourceProject('exodus90');
    assert.equal(await isUserProjectManagerForSourceProject(admin.id, exodus.id), true);
  });

  it('does not promote a reviewer to manager of the project', async () => {
    const reviewer = await seededUser(SEEDED_USERS.reviewer);
    const exodus = await seededSourceProject('exodus90');
    assert.equal(await isUserProjectManagerForSourceProject(reviewer.id, exodus.id), false);
  });
});

describe('language counts', () => {
  it('counts the languages a person manages', async () => {
    assert.equal(await countManagedLanguages((await seededUser(SEEDED_USERS.admin)).id), 2);
    assert.equal(await countManagedLanguages((await seededUser(SEEDED_USERS.translator2)).id), 1);
    assert.equal(await countManagedLanguages((await seededUser(SEEDED_USERS.reviewer)).id), 0);
  });

  it('counts target languages only, never the source language', async () => {
    assert.equal(await countUserTargetLanguages((await seededUser(SEEDED_USERS.reviewer)).id), 2);
  });
});

describe('setUserLanguageRole and removeUserFromLanguage', () => {
  it('grants a role, changes it, and revokes it, without touching other languages', async () => {
    const reviewer = await seededUser(SEEDED_USERS.reviewer);
    const czech = await seededLanguage('cs');
    const slovak = await seededLanguage('sk');
    try {
      await setUserLanguageRole(reviewer.id, czech.id, ProjectRole.TRANSLATOR);
      assert.equal(await getUserRoleForLanguage(reviewer.id, czech.id), ProjectRole.TRANSLATOR);

      await setUserLanguageRole(reviewer.id, czech.id, ProjectRole.EDITOR);
      assert.equal(await getUserRoleForLanguage(reviewer.id, czech.id), ProjectRole.EDITOR);

      // The Slovak row the seed made is untouched by either write.
      assert.equal(await getUserRoleForLanguage(reviewer.id, slovak.id), ProjectRole.REVIEWER);
    } finally {
      await removeUserFromLanguage(reviewer.id, czech.id);
    }
    assert.equal(await getUserRoleForLanguage(reviewer.id, czech.id), null);
  });

  it('lists a language roster with the people the seed put on it', async () => {
    const slovak = await seededLanguage('sk');
    const emails = (await listLanguageMembers(slovak.id)).map((member) => member.user.email).sort();
    assert.deepEqual(emails, [SEEDED_USERS.admin, SEEDED_USERS.reviewer, SEEDED_USERS.translator]);
  });
});
