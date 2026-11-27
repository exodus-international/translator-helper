import assert from 'node:assert/strict';
import test from 'node:test';
import { SourceProjectStatus } from '@/generated/prisma/enums';
import { defaultSelection, parseScope } from '@/domain/standard-translation/standard-translation.types';
import { buildListSearchParams } from '@/lib/list-params';
import { scopeLabel, scopeParam, withCompletedProjects } from './scope';

const exodus = { id: '0b8f5a52-1d1c-4c11-9a43-0f0d6c6f0a01', name: 'Exodus 90', status: SourceProjectStatus.ACTIVE, count: 9 };
const advent = { id: '0b8f5a52-1d1c-4c11-9a43-0f0d6c6f0a02', name: 'Advent', status: SourceProjectStatus.ACTIVE, count: 6 };
const lent = { id: '0b8f5a52-1d1c-4c11-9a43-0f0d6c6f0a03', name: 'Lent 2026', status: SourceProjectStatus.COMPLETE, count: 4 };
const projects = [exodus, advent, lent];

/** What the page reads a `scope` param back as, after the URL the page builds with it. */
function readBack(scope: string | null) {
  const url = new URLSearchParams(buildListSearchParams(new URLSearchParams(), { scope }));
  return parseScope(url.get('scope') ?? undefined);
}

test('the default selection is general entries and the active projects', () => {
  assert.deepEqual(defaultSelection(projects), { includeGeneral: true, projectIds: [exodus.id, advent.id] });
});

test('the default selection stays out of the URL, in any order', () => {
  assert.equal(scopeParam({ includeGeneral: true, projectIds: [advent.id, exodus.id] }, projects), null);
  assert.equal(readBack(null), null);
});

test('a selection other than the default reads back as itself', () => {
  const selection = { includeGeneral: false, projectIds: [exodus.id, lent.id] };
  assert.deepEqual(readBack(scopeParam(selection, projects)), selection);
});

test('an empty selection reads back as empty, not as the default', () => {
  assert.deepEqual(readBack(scopeParam({ includeGeneral: false, projectIds: [] }, projects)), {
    includeGeneral: false,
    projectIds: [],
  });
});

test('showing completed projects adds them to the selection', () => {
  assert.deepEqual(withCompletedProjects(defaultSelection(projects), projects), {
    includeGeneral: true,
    projectIds: [exodus.id, advent.id, lent.id],
  });
});

test('the label names what is selected', () => {
  assert.equal(scopeLabel(defaultSelection(projects), projects), 'All projects + active');
  assert.equal(scopeLabel({ includeGeneral: false, projectIds: [lent.id] }, projects), 'Lent 2026');
  assert.equal(scopeLabel({ includeGeneral: true, projectIds: [exodus.id, lent.id] }, projects), 'All projects + 2 projects');
  assert.equal(scopeLabel({ includeGeneral: false, projectIds: [] }, projects), 'None');
});
