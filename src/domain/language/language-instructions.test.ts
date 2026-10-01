import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProjectRole } from '@/generated/prisma/enums';
import { resolveInstructionsAccess, resolveSelectedLanguage } from './language-instructions';

const HR = { id: 'hr-id', code: 'hr', name: 'Croatian' };
const CS = { id: 'cs-id', code: 'cs', name: 'Czech' };
const DE = { id: 'de-id', code: 'de', name: 'German' };
const TARGETS = [HR, CS, DE];

describe('resolveInstructionsAccess', () => {
  it('gives an admin every target language, all editable', () => {
    const access = resolveInstructionsAccess({ isAdmin: true, targetLanguages: TARGETS, memberships: [] });

    assert.deepEqual(access.languages, TARGETS);
    assert.deepEqual(access.editableIds, [HR.id, CS.id, DE.id]);
  });

  it('gives a member only the languages they are on', () => {
    const access = resolveInstructionsAccess({
      isAdmin: false,
      targetLanguages: TARGETS,
      memberships: [{ languageId: CS.id, role: ProjectRole.TRANSLATOR }],
    });

    assert.deepEqual(access.languages, [CS]);
  });

  it('lets a project manager write, and a translator only read', () => {
    const access = resolveInstructionsAccess({
      isAdmin: false,
      targetLanguages: TARGETS,
      memberships: [
        { languageId: HR.id, role: ProjectRole.PROJECT_MANAGER },
        { languageId: CS.id, role: ProjectRole.TRANSLATOR },
      ],
    });

    assert.deepEqual(access.languages, [HR, CS]);
    assert.deepEqual(access.editableIds, [HR.id]);
  });

  it('gives a reviewer and an editor read access but not write', () => {
    // Writing rewrites every AI translation into the language, so it stays with
    // the one role that answers for the language as a whole.
    for (const role of [ProjectRole.REVIEWER, ProjectRole.EDITOR]) {
      const access = resolveInstructionsAccess({
        isAdmin: false,
        targetLanguages: TARGETS,
        memberships: [{ languageId: HR.id, role }],
      });

      assert.deepEqual(access.languages, [HR]);
      assert.deepEqual(access.editableIds, []);
    }
  });

  it('gives someone with no languages nothing', () => {
    const access = resolveInstructionsAccess({ isAdmin: false, targetLanguages: TARGETS, memberships: [] });

    assert.deepEqual(access.languages, []);
    assert.deepEqual(access.editableIds, []);
  });

  it('ignores a membership in a language that is not a target', () => {
    // A membership in English would otherwise surface a language with nothing
    // to instruct: nothing is translated into the source language.
    const access = resolveInstructionsAccess({
      isAdmin: false,
      targetLanguages: TARGETS,
      memberships: [{ languageId: 'en-id', role: ProjectRole.PROJECT_MANAGER }],
    });

    assert.deepEqual(access.languages, []);
  });
});

describe('resolveSelectedLanguage', () => {
  it('opens the language asked for', () => {
    assert.deepEqual(resolveSelectedLanguage(TARGETS, 'de'), DE);
  });

  it('falls back to the first available when the code is unknown or absent', () => {
    assert.deepEqual(resolveSelectedLanguage(TARGETS, 'pt'), HR);
    assert.deepEqual(resolveSelectedLanguage(TARGETS, null), HR);
    assert.deepEqual(resolveSelectedLanguage(TARGETS, undefined), HR);
  });

  it('will not open a language the viewer cannot see', () => {
    // A link to /instructions?lang=de from someone else must not become access.
    assert.deepEqual(resolveSelectedLanguage([CS], 'de'), CS);
  });

  it('returns null when there is nothing to show', () => {
    assert.equal(resolveSelectedLanguage([], 'hr'), null);
  });
});
