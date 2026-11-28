import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SourceProjectStatus } from '@/generated/prisma/enums';
import { defaultSelection } from '@/domain/standard-translation/standard-translation.types';
import { ScopeFilter } from './scope-filter';

/**
 * The Scope filter as a page opens it: general entries and active projects
 * ticked, completed projects in their own group, marked and left out.
 */

afterEach(cleanup);

const projects = [
  { id: 'project-exodus', name: 'Exodus 90', status: SourceProjectStatus.ACTIVE, count: 9 },
  { id: 'project-lent', name: 'Lent 2026', status: SourceProjectStatus.COMPLETE, count: 4 },
];

test('by default general entries and active projects are ticked, completed ones are not', async () => {
  render(<ScopeFilter selection={defaultSelection(projects)} scopes={{ general: 21, projects }} onChange={() => {}} />);

  await userEvent.setup().click(screen.getByRole('button', { name: 'Scope: All projects + active' }));

  const ticked = (name: RegExp) => screen.getByRole('menuitemcheckbox', { name }).getAttribute('aria-checked');
  assert.equal(ticked(/All projects/), 'true');
  assert.equal(ticked(/Exodus 90/), 'true');
  assert.equal(ticked(/Lent 2026/), 'false');

  const completedGroup = screen.getByRole('group', { name: 'Completed projects' });
  assert.ok(within(completedGroup).getByText('Complete'));
});
