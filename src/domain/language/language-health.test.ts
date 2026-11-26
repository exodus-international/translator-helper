import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { countHealthProblems, languageHealth, type LanguageHealthInput } from './language-health';

const HEALTHY: LanguageHealthInput = {
  isSource: false,
  audioVoice: 'hr-HR-SreckoNeural',
  translationInstructions: 'Use the Jeruzalemska Biblija for scripture quotations.',
  memberCount: 7,
  managerNames: ['Toma Z.'],
};

/** The pills ARE the feature, so the wording is asserted, not just the state. */
function labels(input: Partial<LanguageHealthInput>) {
  return languageHealth({ ...HEALTHY, ...input }).map((pill) => pill.label);
}

describe('languageHealth', () => {
  it('reports every check as ok for a fully configured language', () => {
    assert.deepEqual(labels({}), [
      'Manager: Toma Z.',
      'Voice hr-HR-SreckoNeural',
      'AI Instructions written',
    ]);
    assert.equal(countHealthProblems(languageHealth(HEALTHY)), 0);
  });

  it('names the first manager, so the roster does not have to be opened', () => {
    assert.equal(labels({ managerNames: ['Jana K.', 'Toma Z.'] })[0], 'Manager: Jana K.');
  });

  it('says nobody can manage a language with no project manager', () => {
    const pill = languageHealth({ ...HEALTHY, managerNames: [] }).find((p) => p.key === 'manager');
    assert.deepEqual(pill, {
      key: 'manager',
      state: 'missing',
      label: 'No language manager',
      detail: 'nobody can manage this language',
    });
  });

  it('says a missing voice means approvals generate no audio', () => {
    const pill = languageHealth({ ...HEALTHY, audioVoice: null }).find((p) => p.key === 'voice');
    assert.deepEqual(pill, {
      key: 'voice',
      state: 'missing',
      label: 'No voice',
      detail: 'approvals generate no audio',
    });
  });

  it('treats whitespace-only instructions as unwritten', () => {
    const pill = languageHealth({ ...HEALTHY, translationInstructions: '   \n ' }).find(
      (p) => p.key === 'instructions',
    );
    assert.equal(pill?.state, 'missing');
    assert.equal(pill?.label, 'No AI instructions');
  });

  it('treats null instructions as unwritten', () => {
    assert.equal(
      languageHealth({ ...HEALTHY, translationInstructions: null }).find((p) => p.key === 'instructions')?.state,
      'missing',
    );
  });

  it('adds a members pill only when the language has nobody', () => {
    assert.equal(
      languageHealth(HEALTHY).some((pill) => pill.key === 'members'),
      false,
    );
    assert.deepEqual(languageHealth({ ...HEALTHY, memberCount: 0 })[0], {
      key: 'members',
      state: 'missing',
      label: 'No members',
      detail: 'nobody can translate',
    });
  });

  it('reports a language with nothing configured as four problems', () => {
    const pills = languageHealth({
      isSource: false,
      audioVoice: null,
      translationInstructions: null,
      memberCount: 0,
      managerNames: [],
    });

    assert.deepEqual(pills.map((pill) => pill.label), [
      'No members',
      'No language manager',
      'No voice',
      'No AI instructions',
    ]);
    assert.equal(countHealthProblems(pills), 4);
  });

  it('checks nothing on the source language', () => {
    // English has document versions but no team, instructions or voice, and
    // never will: four grey dashes would be four questions to answer.
    assert.deepEqual(
      languageHealth({
        isSource: true,
        audioVoice: null,
        translationInstructions: null,
        memberCount: 0,
        managerNames: [],
      }),
      [],
    );
  });
});
