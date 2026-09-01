import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProjectPath, buildProjectTranslationsPath, buildTranslationProjectPath } from './source-project-url';

test('a project path carries the identifier, not the id', () => {
  assert.equal(buildProjectPath('advent2025'), '/projects/advent2025');
});

test('the sub-paths build on the same segment', () => {
  assert.equal(buildProjectTranslationsPath('advent2025'), '/projects/advent2025/translations');
  assert.equal(
    buildTranslationProjectPath('advent2025', '65b1bf67-e36e-4ae9-8439-2f0cb9738e6a'),
    '/projects/advent2025/translations/65b1bf67-e36e-4ae9-8439-2f0cb9738e6a',
  );
});

test('segments are escaped', () => {
  // The identifier format rules out these characters, but rows predating them
  // are only checked against "no spaces, slashes, question marks or hashes".
  assert.equal(buildProjectPath('a b'), '/projects/a%20b');
});
