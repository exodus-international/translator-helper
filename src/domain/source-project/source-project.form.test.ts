import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSourceProjectSchema, updateSourceProjectSchema } from './source-project.types';
import {
  EMPTY_PROJECT_FORM,
  isProjectFormComplete,
  toCreateProjectInput,
  toUpdateProjectInput,
} from './source-project.form';

const filled = { name: 'Exodus90 2026', description: 'A description', identifier: 'exodus90', acronym: 'E90' };
const minimal = { ...EMPTY_PROJECT_FORM, name: 'Exodus90 2026', identifier: 'exodus90' };

describe('toCreateProjectInput', () => {
  it('produces something the create schema accepts', () => {
    assert.equal(createSourceProjectSchema.safeParse(toCreateProjectInput(filled)).success, true);
  });

  // The bug in #140: an empty description was sent as null, which
  // z.string().optional() rejects, so creating a project without one failed.
  it('sends an omitted description as undefined, not null', () => {
    const input = toCreateProjectInput(minimal);
    assert.equal(input.description, undefined);
    assert.equal(createSourceProjectSchema.safeParse(input).success, true);
  });

  it('accepts a lone dash acronym, which turns day naming off', () => {
    const input = toCreateProjectInput({ ...minimal, acronym: '-' });
    assert.equal(input.acronym, '-');
    assert.equal(createSourceProjectSchema.safeParse(input).success, true);
  });

  it('sends an empty acronym as null rather than an empty string', () => {
    const input = toCreateProjectInput(minimal);
    assert.equal(input.acronym, null);
    assert.equal(createSourceProjectSchema.safeParse(input).success, true);
  });

  it('trims every field', () => {
    const input = toCreateProjectInput({
      name: '  Exodus90 2026 ',
      description: '  hello ',
      identifier: ' exodus90 ',
      acronym: ' E90 ',
    });
    assert.deepEqual(input, {
      name: 'Exodus90 2026',
      description: 'hello',
      identifier: 'exodus90',
      acronym: 'E90',
    });
  });
});

describe('toUpdateProjectInput', () => {
  it('produces something the update schema accepts', () => {
    assert.equal(updateSourceProjectSchema.safeParse(toUpdateProjectInput(filled)).success, true);
  });

  // Update differs from create here: null is how a description gets cleared.
  it('sends a cleared description as null, which update allows', () => {
    const input = toUpdateProjectInput(minimal);
    assert.equal(input.description, null);
    assert.equal(updateSourceProjectSchema.safeParse(input).success, true);
  });

  it('never sends a null identifier, which the update schema rejects', () => {
    const input = toUpdateProjectInput({ ...filled, identifier: '   ' });
    assert.equal(input.identifier, '');
    assert.notEqual(input.identifier, null);
  });
});

describe('isProjectFormComplete', () => {
  it('needs both a name and an identifier', () => {
    assert.equal(isProjectFormComplete(minimal), true);
    assert.equal(isProjectFormComplete(EMPTY_PROJECT_FORM), false);
    assert.equal(isProjectFormComplete({ ...minimal, name: '   ' }), false);
    assert.equal(isProjectFormComplete({ ...minimal, identifier: '' }), false);
  });

  it('does not require a description or an acronym', () => {
    assert.equal(isProjectFormComplete({ ...minimal, description: '', acronym: '' }), true);
  });
});
