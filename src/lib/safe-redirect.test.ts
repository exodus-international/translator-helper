import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { safeRedirectPath } from './safe-redirect';

describe('safeRedirectPath', () => {
  it('keeps a path on this site, query and all', () => {
    assert.equal(safeRedirectPath('/documents/sml/day-3/hr?thread=abc'), '/documents/sml/day-3/hr?thread=abc');
  });

  it('falls back when there is nowhere to go', () => {
    assert.equal(safeRedirectPath(null), '/dashboard');
    assert.equal(safeRedirectPath(''), '/dashboard');
  });

  it('refuses anything that leaves the site', () => {
    assert.equal(safeRedirectPath('https://evil.example'), '/dashboard');
    assert.equal(safeRedirectPath('//evil.example'), '/dashboard');
    assert.equal(safeRedirectPath('/\\evil.example'), '/dashboard');
  });
});
