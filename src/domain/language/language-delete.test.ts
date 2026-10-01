import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertLanguageDeletable, planLanguageDeletion, type LanguageDependents } from './language-delete';

const CROATIAN = { name: 'Croatian', isSource: false };
const ENGLISH = { name: 'English', isSource: true };

const EMPTY: LanguageDependents = { versions: 0, translationProjects: 0, memberships: 0, invitations: 0 };

describe('planLanguageDeletion', () => {
  it('refuses a language that holds translations, and names how many', () => {
    const plan = planLanguageDeletion(CROATIAN, { ...EMPTY, versions: 148 });

    assert.equal(plan.allowed, false);
    assert.equal(
      plan.allowed === false && plan.reason,
      'Croatian has 148 translations. Deleting the language would destroy every one of them, so it is blocked while any exist.',
    );
  });

  it('refuses a single translation as readily as a hundred', () => {
    const plan = planLanguageDeletion(CROATIAN, { ...EMPTY, versions: 1 });

    assert.equal(plan.allowed, false);
    assert.equal(plan.allowed === false && plan.reason.includes('has 1 translation.'), true);
  });

  it('refuses the source language whatever it holds', () => {
    const plan = planLanguageDeletion(ENGLISH, EMPTY);

    assert.equal(plan.allowed, false);
    assert.equal(
      plan.allowed === false && plan.reason,
      'English is the source language. Documents are written in it, so it cannot be deleted.',
    );
  });

  it('allows an empty language, stating every row the cascade takes', () => {
    const plan = planLanguageDeletion(CROATIAN, {
      versions: 0,
      translationProjects: 1,
      memberships: 0,
      invitations: 2,
    });

    assert.equal(plan.allowed, true);
    assert.equal(
      plan.allowed === true && plan.summary,
      'Croatian has no translations. Deleting it also removes 1 translation project, 0 memberships and 2 pending invitations. This cannot be undone.',
    );
    assert.equal(plan.allowed === true && plan.confirmationPhrase, 'Croatian');
  });
});

describe('assertLanguageDeletable', () => {
  it('throws the refusal before any confirmation is considered', () => {
    assert.throws(() => assertLanguageDeletable(CROATIAN, { ...EMPTY, versions: 3 }, 'Croatian'), {
      message: /blocked while any exist/,
    });
  });

  it('throws when the typed name does not match', () => {
    assert.throws(() => assertLanguageDeletable(CROATIAN, EMPTY, 'croatian'), {
      message: 'Type "Croatian" to confirm the deletion.',
    });
  });

  it('accepts the typed name with surrounding whitespace', () => {
    assert.doesNotThrow(() => assertLanguageDeletable(CROATIAN, EMPTY, '  Croatian '));
  });

  it('rejects an empty confirmation', () => {
    assert.throws(() => assertLanguageDeletable(CROATIAN, EMPTY, ''), { message: /Type "Croatian"/ });
  });
});
