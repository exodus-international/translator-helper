import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loginPath, safeRedirectPath } from './safe-redirect';

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

describe('loginPath', () => {
  it('sends the visitor back to the page they were on', () => {
    assert.equal(
      loginPath('https://translations.example/documents/sml/day-3/hr?thread=abc'),
      '/login?from=%2Fdocuments%2Fsml%2Fday-3%2Fhr%3Fthread%3Dabc',
    );
  });

  it('gives the bare login page when there is no usable page', () => {
    assert.equal(loginPath(null), '/login');
    assert.equal(loginPath(''), '/login');
    assert.equal(loginPath('not a url'), '/login');
    assert.equal(loginPath('https://translations.example/login?from=%2Fdashboard'), '/login');
  });
});
