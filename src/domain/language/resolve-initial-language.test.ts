import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveInitialLanguage } from './resolve-initial-language';

const CROATIAN = { id: 'hr-id', name: 'Croatian' };
const CZECH = { id: 'cs-id', name: 'Czech' };
const GERMAN = { id: 'de-id', name: 'German' };
const SLOVAK = { id: 'sk-id', name: 'Slovak' };

describe('resolveInitialLanguage', () => {
  describe('user is assigned a language on the project', () => {
    it('picks the assigned language over the alphabetically first one', () => {
      assert.equal(
        resolveInitialLanguage({
          userLanguageIds: [CZECH.id],
          projectLanguages: [CROATIAN, CZECH, GERMAN],
        }),
        CZECH.id,
      );
    });

    it('picks the assigned language regardless of project language order', () => {
      assert.equal(
        resolveInitialLanguage({
          userLanguageIds: [SLOVAK.id],
          projectLanguages: [SLOVAK, CROATIAN, CZECH],
        }),
        SLOVAK.id,
      );
    });

    it('breaks ties alphabetically by name when several assigned languages match', () => {
      assert.equal(
        resolveInitialLanguage({
          userLanguageIds: [SLOVAK.id, CZECH.id, GERMAN.id],
          projectLanguages: [CROATIAN, CZECH, GERMAN, SLOVAK],
        }),
        CZECH.id,
      );
    });

    it('ignores assigned languages the project does not have', () => {
      assert.equal(
        resolveInitialLanguage({
          userLanguageIds: ['fr-id', GERMAN.id],
          projectLanguages: [CROATIAN, GERMAN],
        }),
        GERMAN.id,
      );
    });
  });

  describe('user has no matching language on the project', () => {
    it('falls back to the project language that sorts first', () => {
      assert.equal(
        resolveInitialLanguage({
          userLanguageIds: ['fr-id'],
          projectLanguages: [GERMAN, CROATIAN],
        }),
        CROATIAN.id,
      );
    });

    it('falls back when the user has no assigned languages at all', () => {
      assert.equal(
        resolveInitialLanguage({
          userLanguageIds: [],
          projectLanguages: [SLOVAK, CZECH],
        }),
        CZECH.id,
      );
    });
  });

  describe('project has no translation projects', () => {
    it('returns an empty string rather than an unrelated language', () => {
      assert.equal(
        resolveInitialLanguage({
          userLanguageIds: [CZECH.id],
          projectLanguages: [],
        }),
        '',
      );
    });

    it('returns an empty string when nothing is known', () => {
      assert.equal(resolveInitialLanguage({ userLanguageIds: [], projectLanguages: [] }), '');
    });
  });

  it('does not mutate the caller’s project language array', () => {
    const projectLanguages = [GERMAN, CROATIAN, CZECH];

    resolveInitialLanguage({ userLanguageIds: [], projectLanguages });

    assert.deepEqual(projectLanguages, [GERMAN, CROATIAN, CZECH]);
  });
});
