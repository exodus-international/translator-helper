import assert from 'node:assert/strict';
import test from 'node:test';
import { bugReportUrl } from './feedback-button';

const page = (pathname: string) => new URL(bugReportUrl(pathname)).searchParams.get('customfield_10043');

test('the bug report carries the page URL with one slash after the host', () => {
  assert.equal(page('/documents'), 'https://exodus-translations.ff0000.cz/documents');
  assert.equal(page('/'), 'https://exodus-translations.ff0000.cz/');
  assert.equal(page('/documents/keep-watch/day-07/cs'), 'https://exodus-translations.ff0000.cz/documents/keep-watch/day-07/cs');
});

test('a path that already has two slashes, or none, still gives one', () => {
  assert.equal(page('//documents'), 'https://exodus-translations.ff0000.cz/documents');
  assert.equal(page('documents'), 'https://exodus-translations.ff0000.cz/documents');
});

test('the page URL is one query value, whatever it holds', () => {
  const url = new URL(bugReportUrl('/documents/a&b'));
  assert.deepEqual([...url.searchParams.keys()], ['customfield_10043']);
  assert.equal(url.pathname, '/servicedesk/customer/portal/1/group/1/create/10009');
});
