import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSourceProjectSchema, updateSourceProjectSchema } from './source-project.types';
import {
  EMPTY_PROJECT_FORM,
  isProjectFormComplete,
  slugifyProjectName,
  toCreateProjectInput,
  toUpdateProjectInput,
} from './source-project.form';

const filled = {
  name: 'Exodus90 2026',
  description: 'A description',
  slug: 'exodus90',
  repositoryDirectory: 'exodus90',
  acronym: 'E90',
  deployToGithub: true,
};
/**
 * A project filled in the way the form starts out: deploying, because
 * `EMPTY_PROJECT_FORM` has the toggle on, which is why a repository directory
 * belongs here. Tests that care about the other case turn it off themselves.
 */
const defaults = {
  ...EMPTY_PROJECT_FORM,
  name: 'Exodus90 2026',
  slug: 'exodus90',
  repositoryDirectory: 'exodus90',
};

describe('toCreateProjectInput', () => {
  it('produces something the create schema accepts', () => {
    assert.equal(createSourceProjectSchema.safeParse(toCreateProjectInput(filled)).success, true);
  });

  // The bug in #140: an empty description was sent as null, which
  // z.string().optional() rejects, so creating a project without one failed.
  it('sends an omitted description as undefined, not null', () => {
    const input = toCreateProjectInput(defaults);
    assert.equal(input.description, undefined);
    assert.equal(createSourceProjectSchema.safeParse(input).success, true);
  });

  it('accepts a lone dash acronym, which turns day naming off', () => {
    const input = toCreateProjectInput({ ...defaults, acronym: '-' });
    assert.equal(input.acronym, '-');
    assert.equal(createSourceProjectSchema.safeParse(input).success, true);
  });

  it('sends an empty acronym as null rather than an empty string', () => {
    const input = toCreateProjectInput(defaults);
    assert.equal(input.acronym, null);
    assert.equal(createSourceProjectSchema.safeParse(input).success, true);
  });

  it('trims every field', () => {
    const input = toCreateProjectInput({
      name: '  Exodus90 2026 ',
      description: '  hello ',
      slug: ' exodus90 ',
      repositoryDirectory: ' exodus-90 ',
      acronym: ' E90 ',
      deployToGithub: true,
    });
    assert.deepEqual(input, {
      name: 'Exodus90 2026',
      description: 'hello',
      slug: 'exodus90',
      repositoryDirectory: 'exodus-90',
      acronym: 'E90',
    });
  });

  // The slug is what the project is addressed by, so it survives the toggle;
  // only the repository directory is dropped.
  it('omits the repository directory when GitHub deploy is turned off, and keeps the slug', () => {
    const input = toCreateProjectInput({ ...defaults, deployToGithub: false });
    assert.equal(input.repositoryDirectory, undefined);
    assert.equal(input.slug, 'exodus90');
    assert.equal(createSourceProjectSchema.safeParse(input).success, true);
  });

  it('rejects a project with no slug, deploying or not', () => {
    for (const deployToGithub of [true, false]) {
      const input = toCreateProjectInput({ ...defaults, slug: '', deployToGithub });
      assert.equal(createSourceProjectSchema.safeParse(input).success, false);
    }
  });
});

describe('slug and repository directory format', () => {
  const create = (slug: string) =>
    createSourceProjectSchema.safeParse(toCreateProjectInput({ ...defaults, slug })).success;

  // Content folders use both separators, so "october_2026" must pass alongside
  // "exodus-90". This was rejected in production.
  it('accepts underscores and dashes as separators', () => {
    assert.equal(create('exodus90'), true);
    assert.equal(create('exodus-90'), true);
    assert.equal(create('october_2026'), true);
    assert.equal(create('lent_2026-week1'), true);
  });

  it('rejects runs of separators and leading or trailing ones', () => {
    assert.equal(create('october__2026'), false);
    assert.equal(create('_october'), false);
    assert.equal(create('october_'), false);
    assert.equal(create('-october'), false);
  });

  it('rejects uppercase, spaces and other punctuation', () => {
    assert.equal(create('October_2026'), false);
    assert.equal(create('october 2026'), false);
    assert.equal(create('october.2026'), false);
  });

  it('holds the repository directory to the same rules', () => {
    const bad = toCreateProjectInput({ ...defaults, repositoryDirectory: 'October 2026' });
    assert.equal(createSourceProjectSchema.safeParse(bad).success, false);
  });
});

describe('slugifyProjectName', () => {
  it('proposes a slug the create schema accepts', () => {
    for (const name of ['Exodus90 2026', 'Lent 2026', 'Advent — Week 1', 'Čeština Projekt']) {
      const slug = slugifyProjectName(name);
      const input = toCreateProjectInput({ ...defaults, slug });
      assert.equal(createSourceProjectSchema.safeParse(input).success, true, `${name} -> ${slug}`);
    }
  });

  it('folds accents, lowercases, and collapses everything else to single dashes', () => {
    assert.equal(slugifyProjectName('Exodus90 2026'), 'exodus90-2026');
    assert.equal(slugifyProjectName('Advent — Week 1'), 'advent-week-1');
    assert.equal(slugifyProjectName('Čeština'), 'cestina');
    assert.equal(slugifyProjectName('  spaced  out  '), 'spaced-out');
  });

  // Nothing usable is better than something broken: the field stays empty and
  // the submit button stays disabled until the admin fills it in.
  it('returns an empty string when a name has nothing to slugify', () => {
    assert.equal(slugifyProjectName('!!!'), '');
    assert.equal(slugifyProjectName('日本語'), '');
  });
});

describe('toUpdateProjectInput', () => {
  it('produces something the update schema accepts', () => {
    assert.equal(updateSourceProjectSchema.safeParse(toUpdateProjectInput(filled)).success, true);
  });

  // Update differs from create here: null is how a description gets cleared.
  it('sends a cleared description as null, which update allows', () => {
    const input = toUpdateProjectInput(defaults);
    assert.equal(input.description, null);
    assert.equal(updateSourceProjectSchema.safeParse(input).success, true);
  });

  it('never sends a null repository directory while GitHub deploy stays on', () => {
    const input = toUpdateProjectInput({ ...filled, repositoryDirectory: '   ' });
    assert.equal(input.repositoryDirectory, '');
    assert.notEqual(input.repositoryDirectory, null);
  });

  it('clears the repository directory when GitHub deploy is turned off', () => {
    const input = toUpdateProjectInput({ ...filled, deployToGithub: false });
    assert.equal(input.repositoryDirectory, null);
    assert.equal(input.slug, 'exodus90');
    assert.equal(updateSourceProjectSchema.safeParse(input).success, true);
  });
});

describe('isProjectFormComplete', () => {
  it('needs a name and a slug', () => {
    assert.equal(isProjectFormComplete(defaults), true);
    assert.equal(isProjectFormComplete(EMPTY_PROJECT_FORM), false);
    assert.equal(isProjectFormComplete({ ...defaults, name: '   ' }), false);
    assert.equal(isProjectFormComplete({ ...defaults, slug: '' }), false);
  });

  it('needs a repository directory only while GitHub deploy is on', () => {
    assert.equal(isProjectFormComplete({ ...defaults, repositoryDirectory: '' }), false);
    assert.equal(isProjectFormComplete({ ...defaults, repositoryDirectory: '', deployToGithub: false }), true);
  });

  it('does not require a description or an acronym', () => {
    assert.equal(isProjectFormComplete({ ...defaults, description: '', acronym: '' }), true);
  });
});
