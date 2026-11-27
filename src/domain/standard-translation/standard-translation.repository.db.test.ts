/**
 * The standard translation dictionary against the database: the unique index
 * (general entries included, which Prisma can't express), the cascade from a
 * project, the list behind the page and its Scope filter, and moving an entry
 * to all projects.
 *
 * Each test makes its own language and projects, so counts are its own and
 * nothing the seed or another test holds is touched.
 */
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { SourceProjectStatus } from '@/generated/prisma/enums';
import prisma from '@/lib/db';
import { SEEDED_USERS, seededLanguage, seededUser } from '../../../tests/seeded';
import { sourceKeyOf } from './match-form';
import {
  createStandardTranslation,
  deleteStandardTranslation,
  getMoveConflict,
  getStandardTranslationById,
  listStandardTranslations,
  moveStandardTranslationToGeneral,
  updateStandardTranslation,
} from './standard-translation.repository';
import type { CreateStandardTranslationInput } from './standard-translation.types';

after(() => prisma.$disconnect());

/**
 * A language translating two active projects and a completed one, plus a
 * project it doesn't translate. Deleting the projects and the language takes
 * every entry with them.
 */
async function dictionary() {
  const tag = randomUUID().slice(0, 8);
  const language = await prisma.language.create({ data: { code: `st-${tag}`, name: `Language ${tag}` } });
  const project = (name: string, status: SourceProjectStatus = SourceProjectStatus.ACTIVE) =>
    prisma.sourceProject.create({
      data: { name: `${name} ${tag}`, slug: `st-${name.toLowerCase()}-${tag}`, repositoryDirectory: null, status },
    });
  const alpha = await project('Alpha');
  const beta = await project('Beta');
  const done = await project('Done', SourceProjectStatus.COMPLETE);
  const foreign = await project('Foreign');
  await prisma.translationProject.createMany({
    data: [alpha, beta, done].map((p) => ({ name: p.name, sourceProjectId: p.id, languageId: language.id })),
  });
  const user = await seededUser(SEEDED_USERS.translator);

  const add = (fields: Partial<CreateStandardTranslationInput> & { sourceText: string }) =>
    createStandardTranslation(
      {
        languageId: language.id,
        sourceProjectId: null,
        name: null,
        targetText: `target of ${fields.sourceText}`,
        fixedForm: false,
        note: null,
        ...fields,
      },
      user.id,
    );

  const cleanup = async () => {
    await prisma.sourceProject.deleteMany({ where: { id: { in: [alpha.id, beta.id, done.id, foreign.id] } } });
    await prisma.language.delete({ where: { id: language.id } });
  };

  return { language, alpha, beta, done, foreign, user, add, cleanup };
}

describe('createStandardTranslation and updateStandardTranslation', () => {
  it('derives the source key from the source and records who wrote the entry', async () => {
    const d = await dictionary();
    try {
      const created = await d.add({ sourceText: 'Glory  Be\nto the Father', name: 'Glory Be' });
      const stored = await prisma.standardTranslation.findUniqueOrThrow({ where: { id: created.id } });

      assert.equal(stored.sourceKey, sourceKeyOf('Glory  Be\nto the Father'));
      assert.equal(created.createdBy?.id, d.user.id);
      assert.equal(created.updatedBy?.id, d.user.id);
      assert.equal(created.languageId, d.language.id);
      assert.equal(created.sourceProject, null);
    } finally {
      await d.cleanup();
    }
  });

  it('rederives the key on update and records the editor, keeping the author', async () => {
    const d = await dictionary();
    const reviewer = await seededUser(SEEDED_USERS.reviewer);
    try {
      const created = await d.add({ sourceText: 'Our Father' });
      const updated = await updateStandardTranslation(
        created.id,
        { sourceProjectId: d.alpha.id, name: null, sourceText: 'Hail Mary', targetText: 'Zdravo Marijo', fixedForm: true, note: null },
        reviewer.id,
      );
      const stored = await prisma.standardTranslation.findUniqueOrThrow({ where: { id: created.id } });

      assert.equal(stored.sourceKey, sourceKeyOf('Hail Mary'));
      assert.equal(updated.sourceProject?.id, d.alpha.id);
      assert.equal(updated.createdBy?.id, d.user.id);
      assert.equal(updated.updatedBy?.id, reviewer.id);
    } finally {
      await d.cleanup();
    }
  });

  it('lets a general entry and a project entry share a source', async () => {
    const d = await dictionary();
    try {
      await d.add({ sourceText: 'Glory Be' });
      const projectEntry = await d.add({ sourceText: 'Glory Be', sourceProjectId: d.alpha.id });
      assert.equal(projectEntry.sourceProject?.id, d.alpha.id);
    } finally {
      await d.cleanup();
    }
  });

  it('refuses a second general entry with the same source, naming the language', async () => {
    const d = await dictionary();
    try {
      await d.add({ sourceText: 'Glory Be' });
      await assert.rejects(d.add({ sourceText: 'glory be' }), {
        message: `A standard translation with this source already exists for all projects in ${d.language.name}`,
      });
    } finally {
      await d.cleanup();
    }
  });

  it('refuses a second entry with the same source in one project, naming the project', async () => {
    const d = await dictionary();
    try {
      await d.add({ sourceText: 'Glory Be', sourceProjectId: d.alpha.id });
      await assert.rejects(d.add({ sourceText: 'Glory Be', sourceProjectId: d.alpha.id }), {
        message: `A standard translation with this source already exists for ${d.alpha.name}`,
      });
    } finally {
      await d.cleanup();
    }
  });

  it('refuses a project the language does not translate', async () => {
    const d = await dictionary();
    try {
      await assert.rejects(d.add({ sourceText: 'Amen', sourceProjectId: d.foreign.id }), {
        message: 'That project is not translated into this language',
      });
    } finally {
      await d.cleanup();
    }
  });

  it('refuses an entry for the source language', async () => {
    const d = await dictionary();
    const source = await prisma.language.create({
      data: { code: `src-${randomUUID().slice(0, 8)}`, name: 'Source', isSource: true },
    });
    try {
      await assert.rejects(d.add({ sourceText: 'Amen', languageId: source.id }), {
        message: 'Standard translations belong to the languages documents are translated into',
      });
    } finally {
      await prisma.language.delete({ where: { id: source.id } });
      await d.cleanup();
    }
  });

  it('checks an update against the stored language, so an entry stays in it', async () => {
    // Foreign is translated into Croatian, not into this language: an entry
    // of this language can't be pointed at it, whatever Croatian allows.
    const d = await dictionary();
    const croatian = await seededLanguage('hr');
    await prisma.translationProject.create({
      data: { name: d.foreign.name, sourceProjectId: d.foreign.id, languageId: croatian.id },
    });
    try {
      const created = await d.add({ sourceText: 'Amen' });
      await assert.rejects(
        updateStandardTranslation(
          created.id,
          { sourceProjectId: d.foreign.id, name: null, sourceText: 'Amen', targetText: 'Amen', fixedForm: false, note: null },
          d.user.id,
        ),
        { message: 'That project is not translated into this language' },
      );
      assert.equal((await getStandardTranslationById(created.id))?.languageId, d.language.id);
    } finally {
      await d.cleanup();
    }
  });
});

describe('deleting', () => {
  it('deletes one entry', async () => {
    const d = await dictionary();
    try {
      const created = await d.add({ sourceText: 'Amen' });
      await deleteStandardTranslation(created.id);
      assert.equal(await getStandardTranslationById(created.id), null);
    } finally {
      await d.cleanup();
    }
  });

  it('takes a project entries with the project, and leaves general entries', async () => {
    const d = await dictionary();
    try {
      const general = await d.add({ sourceText: 'Glory Be' });
      const projectEntry = await d.add({ sourceText: 'Glory Be', sourceProjectId: d.alpha.id });

      await prisma.sourceProject.delete({ where: { id: d.alpha.id } });

      assert.equal(await getStandardTranslationById(projectEntry.id), null);
      assert.notEqual(await getStandardTranslationById(general.id), null);
    } finally {
      await d.cleanup();
    }
  });
});

describe('listStandardTranslations', () => {
  it('shows only the selected scopes', async () => {
    const d = await dictionary();
    try {
      await d.add({ sourceText: 'General' });
      await d.add({ sourceText: 'In alpha', sourceProjectId: d.alpha.id });
      await d.add({ sourceText: 'In beta', sourceProjectId: d.beta.id });

      const generalAndAlpha = await listStandardTranslations({
        languageId: d.language.id,
        q: '',
        page: 1,
        selection: { includeGeneral: true, projectIds: [d.alpha.id] },
      });
      assert.deepEqual(
        generalAndAlpha.rows.map((row) => row.sourceText),
        ['General', 'In alpha'],
      );
      assert.equal(generalAndAlpha.total, 2);

      const betaOnly = await listStandardTranslations({
        languageId: d.language.id,
        q: '',
        page: 1,
        selection: { includeGeneral: false, projectIds: [d.beta.id] },
      });
      assert.deepEqual(
        betaOnly.rows.map((row) => row.sourceText),
        ['In beta'],
      );
    } finally {
      await d.cleanup();
    }
  });

  it('shows nothing when nothing is selected', async () => {
    const d = await dictionary();
    try {
      await d.add({ sourceText: 'General' });
      const page = await listStandardTranslations({
        languageId: d.language.id,
        q: '',
        page: 1,
        selection: { includeGeneral: false, projectIds: [] },
      });
      assert.deepEqual(page.rows, []);
      assert.equal(page.total, 0);
    } finally {
      await d.cleanup();
    }
  });

  it('searches name, source and translation, ignoring case', async () => {
    const d = await dictionary();
    try {
      await d.add({ sourceText: 'Glory be to the Father', name: 'Doxology' });
      await d.add({ sourceText: 'In the name of the Father', name: 'Sign of the Cross' });
      await d.add({ sourceText: 'Amen', targetText: 'Amen, GLORY' });
      await d.add({ sourceText: 'Our Father' });

      const page = await listStandardTranslations({
        languageId: d.language.id,
        q: 'glory',
        page: 1,
        selection: { includeGeneral: true, projectIds: [] },
      });
      assert.deepEqual(
        page.rows.map((row) => row.sourceText),
        ['Glory be to the Father', 'Amen'],
      );

      const byName = await listStandardTranslations({
        languageId: d.language.id,
        q: 'CROSS',
        page: 1,
        selection: { includeGeneral: true, projectIds: [] },
      });
      assert.deepEqual(
        byName.rows.map((row) => row.sourceText),
        ['In the name of the Father'],
      );
    } finally {
      await d.cleanup();
    }
  });

  it('orders by name with unnamed entries last, then by source', async () => {
    const d = await dictionary();
    try {
      await d.add({ sourceText: 'Zeta' });
      await d.add({ sourceText: 'Beta', name: 'B' });
      await d.add({ sourceText: 'Alpha' });
      await d.add({ sourceText: 'Gamma', name: 'A' });
      await d.add({ sourceText: 'Delta', name: 'B' });

      const page = await listStandardTranslations({
        languageId: d.language.id,
        q: '',
        page: 1,
        selection: { includeGeneral: true, projectIds: [] },
      });
      assert.deepEqual(
        page.rows.map((row) => row.sourceText),
        ['Gamma', 'Beta', 'Delta', 'Alpha', 'Zeta'],
      );
    } finally {
      await d.cleanup();
    }
  });

  it('pages by 25 and counts every page', async () => {
    const d = await dictionary();
    try {
      await prisma.standardTranslation.createMany({
        data: Array.from({ length: 26 }, (_, i) => {
          const sourceText = `Entry ${String(i).padStart(2, '0')}`;
          return { languageId: d.language.id, sourceText, sourceKey: sourceKeyOf(sourceText), targetText: 'x' };
        }),
      });
      const selection = { includeGeneral: true, projectIds: [] };

      const first = await listStandardTranslations({ languageId: d.language.id, q: '', page: 1, selection });
      const second = await listStandardTranslations({ languageId: d.language.id, q: '', page: 2, selection });

      assert.equal(first.rows.length, 25);
      assert.deepEqual(
        second.rows.map((row) => row.sourceText),
        ['Entry 25'],
      );
      assert.equal(second.total, 26);
    } finally {
      await d.cleanup();
    }
  });

  it('defaults to general entries and active projects, counting the completed ones it hides', async () => {
    const d = await dictionary();
    try {
      await d.add({ sourceText: 'General' });
      await d.add({ sourceText: 'In alpha', sourceProjectId: d.alpha.id });
      await d.add({ sourceText: 'Done one', sourceProjectId: d.done.id });
      await d.add({ sourceText: 'Done two', sourceProjectId: d.done.id });

      const page = await listStandardTranslations({ languageId: d.language.id, q: '', page: 1, selection: null });

      assert.deepEqual(page.selection, { includeGeneral: true, projectIds: [d.alpha.id, d.beta.id] });
      assert.deepEqual(
        page.rows.map((row) => row.sourceText),
        ['General', 'In alpha'],
      );
      assert.equal(page.total, 2);
      assert.equal(page.hiddenCompletedCount, 2);
    } finally {
      await d.cleanup();
    }
  });

  it('counts hidden completed entries that match the search only, and none once selected', async () => {
    const d = await dictionary();
    try {
      await d.add({ sourceText: 'Glory Be', sourceProjectId: d.done.id });
      await d.add({ sourceText: 'Amen', sourceProjectId: d.done.id });

      const searched = await listStandardTranslations({ languageId: d.language.id, q: 'glory', page: 1, selection: null });
      assert.equal(searched.hiddenCompletedCount, 1);

      const shown = await listStandardTranslations({
        languageId: d.language.id,
        q: '',
        page: 1,
        selection: { includeGeneral: true, projectIds: [d.done.id] },
      });
      assert.equal(shown.hiddenCompletedCount, 0);
      assert.equal(shown.total, 2);
    } finally {
      await d.cleanup();
    }
  });

  it('counts each scope of the language, empty projects included, whatever is selected', async () => {
    const d = await dictionary();
    try {
      await d.add({ sourceText: 'General' });
      await d.add({ sourceText: 'In alpha', sourceProjectId: d.alpha.id });
      await d.add({ sourceText: 'Also in alpha', sourceProjectId: d.alpha.id });
      await d.add({ sourceText: 'Done', sourceProjectId: d.done.id });

      const page = await listStandardTranslations({
        languageId: d.language.id,
        q: '',
        page: 1,
        selection: { includeGeneral: false, projectIds: [] },
      });

      assert.equal(page.scopes.general, 1);
      assert.deepEqual(page.scopes.projects, [
        { id: d.alpha.id, name: d.alpha.name, status: SourceProjectStatus.ACTIVE, count: 2 },
        { id: d.beta.id, name: d.beta.name, status: SourceProjectStatus.ACTIVE, count: 0 },
        { id: d.done.id, name: d.done.name, status: SourceProjectStatus.COMPLETE, count: 1 },
      ]);
    } finally {
      await d.cleanup();
    }
  });
});

describe('moveStandardTranslationToGeneral', () => {
  it('makes a project entry general when no general entry has its source', async () => {
    const d = await dictionary();
    const reviewer = await seededUser(SEEDED_USERS.reviewer);
    try {
      const projectEntry = await d.add({ sourceText: 'Glory Be', sourceProjectId: d.alpha.id });
      assert.equal(await getMoveConflict(projectEntry.id), null);

      const moved = await moveStandardTranslationToGeneral(projectEntry.id, undefined, reviewer.id);

      assert.equal(moved.id, projectEntry.id);
      assert.equal(moved.sourceProject, null);
      assert.equal(moved.updatedBy?.id, reviewer.id);
    } finally {
      await d.cleanup();
    }
  });

  it('reads the general entry a move would clash with', async () => {
    const d = await dictionary();
    try {
      const general = await d.add({ sourceText: 'Glory Be' });
      const projectEntry = await d.add({ sourceText: 'glory be', sourceProjectId: d.alpha.id });

      assert.equal((await getMoveConflict(projectEntry.id))?.id, general.id);
      // A general entry has nothing to move into.
      assert.equal(await getMoveConflict(general.id), null);
    } finally {
      await d.cleanup();
    }
  });

  it('refuses a clash until told which entry to keep', async () => {
    const d = await dictionary();
    try {
      const general = await d.add({ sourceText: 'Glory Be' });
      const projectEntry = await d.add({ sourceText: 'Glory Be', sourceProjectId: d.alpha.id });

      await assert.rejects(moveStandardTranslationToGeneral(projectEntry.id, undefined, d.user.id), /choose which to keep/);

      assert.notEqual(await getStandardTranslationById(general.id), null);
      assert.equal((await getStandardTranslationById(projectEntry.id))?.sourceProject?.id, d.alpha.id);
    } finally {
      await d.cleanup();
    }
  });

  it('keeps the project entry as the general one, replacing the old general entry', async () => {
    const d = await dictionary();
    try {
      const general = await d.add({ sourceText: 'Glory Be' });
      const projectEntry = await d.add({ sourceText: 'Glory Be', sourceProjectId: d.alpha.id });

      const kept = await moveStandardTranslationToGeneral(projectEntry.id, 'project', d.user.id);

      assert.equal(kept.id, projectEntry.id);
      assert.equal(kept.sourceProject, null);
      assert.equal(await getStandardTranslationById(general.id), null);
    } finally {
      await d.cleanup();
    }
  });

  it('keeps the general entry, dropping the project entry', async () => {
    const d = await dictionary();
    try {
      const general = await d.add({ sourceText: 'Glory Be' });
      const projectEntry = await d.add({ sourceText: 'Glory Be', sourceProjectId: d.alpha.id });

      const kept = await moveStandardTranslationToGeneral(projectEntry.id, 'general', d.user.id);

      assert.equal(kept.id, general.id);
      assert.equal(await getStandardTranslationById(projectEntry.id), null);
    } finally {
      await d.cleanup();
    }
  });

  it('refuses to move an entry that is already general', async () => {
    const d = await dictionary();
    try {
      const general = await d.add({ sourceText: 'Glory Be' });
      await assert.rejects(moveStandardTranslationToGeneral(general.id, undefined, d.user.id), /already applies to all projects/);
    } finally {
      await d.cleanup();
    }
  });
});
