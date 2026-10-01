import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDeployLanguageFilter } from './deploy-language-filter';

const croatian = { id: 'lang-hr' };
const polish = { id: 'lang-pl' };

describe('resolveDeployLanguageFilter', () => {
  it('keeps a stored language that still has documents waiting', () => {
    assert.equal(resolveDeployLanguageFilter('lang-pl', [croatian, polish]), 'lang-pl');
  });

  it('keeps "all"', () => {
    assert.equal(resolveDeployLanguageFilter('all', [croatian, polish]), 'all');
  });

  it('falls back to "all" when the stored language has nothing waiting any more', () => {
    assert.equal(resolveDeployLanguageFilter('lang-sk', [croatian, polish]), 'all');
  });

  it('falls back to "all" when nothing is waiting at all', () => {
    assert.equal(resolveDeployLanguageFilter('lang-sk', []), 'all');
  });
});
