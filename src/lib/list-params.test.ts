import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildListSearchParams,
  getPageTokens,
  getPaginationRange,
  getTotalPages,
  parseListParams,
  toURLSearchParams,
} from './list-params';

const options = {
  allowedSorts: ['title', 'createdAt', 'updatedAt', 'status'] as const,
  defaultSort: 'updatedAt',
  defaultOrder: 'desc' as const,
};

test('parseListParams applies defaults for an empty query', () => {
  assert.deepEqual(parseListParams({}, options), {
    page: 1,
    pageSize: 25,
    q: '',
    sort: 'updatedAt',
    order: 'desc',
    skip: 0,
    take: 25,
  });
});

test('parseListParams reads the canonical ?page ?q ?sort ?order ?pageSize keys', () => {
  const parsed = parseListParams(
    { page: '3', q: ' exodus ', sort: 'title', order: 'asc', pageSize: '10' },
    options,
  );
  assert.equal(parsed.page, 3);
  assert.equal(parsed.q, 'exodus');
  assert.equal(parsed.sort, 'title');
  assert.equal(parsed.order, 'asc');
  assert.equal(parsed.skip, 20);
  assert.equal(parsed.take, 10);
});

test('parseListParams accepts legacy ?search and ?perPage aliases', () => {
  const parsed = parseListParams({ search: 'lent', perPage: '50' }, options);
  assert.equal(parsed.q, 'lent');
  assert.equal(parsed.pageSize, 50);
});

test('parseListParams clamps invalid numbers and falls back for unknown sorts', () => {
  const parsed = parseListParams(
    { page: '0', pageSize: '9999', sort: 'nope', order: 'sideways' },
    options,
  );
  assert.equal(parsed.page, 1);
  assert.equal(parsed.pageSize, 100);
  assert.equal(parsed.sort, 'updatedAt');
  assert.equal(parsed.order, 'desc');
});

test('parseListParams keeps the first value when a key repeats', () => {
  const parsed = parseListParams({ page: ['2', '5'], q: ['a', 'b'] }, options);
  assert.equal(parsed.page, 2);
  assert.equal(parsed.q, 'a');
});

test('getTotalPages rounds up and never drops below one', () => {
  assert.equal(getTotalPages(0, 25), 1);
  assert.equal(getTotalPages(25, 25), 1);
  assert.equal(getTotalPages(26, 25), 2);
  assert.equal(getTotalPages(142, 25), 6);
});

test('getPaginationRange formats the Showing X–Y of Z line', () => {
  assert.equal(getPaginationRange(1, 25, 142).text, 'Showing 1–25 of 142');
  assert.equal(getPaginationRange(6, 25, 142).text, 'Showing 126–142 of 142');
  assert.equal(getPaginationRange(1, 25, 3).text, 'Showing 1–3 of 3');
  assert.equal(getPaginationRange(1, 25, 0).text, 'No results');
});

test('getPaginationRange clamps a page past the end', () => {
  const range = getPaginationRange(99, 25, 40);
  assert.deepEqual([range.start, range.end], [26, 40]);
  assert.equal(range.text, 'Showing 26–40 of 40');
});

test('buildListSearchParams preserves unrelated filters and resets to page 1 on search', () => {
  const current = new URLSearchParams({ page: '4', sourceProject: 'abc', sort: 'title', order: 'asc' });
  const next = buildListSearchParams(current, { q: 'lent' });
  const parsed = new URLSearchParams(next);
  assert.equal(parsed.get('q'), 'lent');
  assert.equal(parsed.get('sourceProject'), 'abc');
  assert.equal(parsed.get('page'), null);
  // Search clears the legacy alias too.
  assert.equal(parsed.get('search'), null);
});

test('buildListSearchParams keeps an explicit page and drops empty values', () => {
  const current = new URLSearchParams({ page: '4', q: 'old' });
  const next = buildListSearchParams(current, { page: 2, q: '' });
  const parsed = new URLSearchParams(next);
  assert.equal(parsed.get('page'), '2');
  assert.equal(parsed.get('q'), null);
});

test('getPageTokens shows every page up to seven', () => {
  assert.deepEqual(getPageTokens(1, 1), [1]);
  assert.deepEqual(getPageTokens(3, 7), [1, 2, 3, 4, 5, 6, 7]);
});

test('getPageTokens windows around the current page with ellipsis', () => {
  assert.deepEqual(getPageTokens(1, 12), [1, 2, 3, 4, 5, 'ellipsis-end', 12]);
  assert.deepEqual(getPageTokens(6, 12), [1, 'ellipsis-start', 5, 6, 7, 'ellipsis-end', 12]);
  assert.deepEqual(getPageTokens(12, 12), [1, 'ellipsis-start', 8, 9, 10, 11, 12]);
});

test('toURLSearchParams flattens repeated keys and drops undefined', () => {
  const params = toURLSearchParams({ page: '2', type: ['DAY', 'MEETING'], q: undefined });
  assert.deepEqual(params.getAll('type'), ['DAY', 'MEETING']);
  assert.equal(params.get('page'), '2');
  assert.equal(params.get('q'), null);
});
