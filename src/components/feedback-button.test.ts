import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bugReportUrl } from './feedback-button';

/** The page a bug report says it came from, as the service desk will read it. */
function reportedPage(href: string) {
  return new URL(href).searchParams.get('customfield_10043');
}

describe('bugReportUrl', () => {
  it('reports the page intact, with a single slash between origin and path', () => {
    const cases = [
      { pathname: '/', page: 'http://localhost:3000/' },
      { pathname: '/login', page: 'http://localhost:3000/login' },
      // An unencoded value would end at the "&" and report /documents/r.
      { pathname: '/documents/r&d', page: 'http://localhost:3000/documents/r&d' },
    ];

    for (const { pathname, page } of cases) {
      assert.equal(reportedPage(bugReportUrl(pathname, 'http://localhost:3000')), page, pathname);
    }
  });

  it("reports the environment's own origin from NEXT_PUBLIC_APP_URL", () => {
    const original = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = 'https://staging.example.org';
    try {
      assert.equal(reportedPage(bugReportUrl('/dashboard')), 'https://staging.example.org/dashboard');
    } finally {
      if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = original;
    }
  });

  it('opens the service-desk bug form', () => {
    const link = new URL(bugReportUrl('/dashboard', 'http://localhost:3000'));

    assert.equal(
      link.origin + link.pathname,
      'https://exodus90.atlassian.net/servicedesk/customer/portal/1/group/1/create/10009',
    );
  });
});
