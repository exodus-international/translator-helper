import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { cleanup, render, screen } from '@testing-library/react';
import { ProjectRole } from '@/generated/prisma/enums';
import { createTestRouter } from '../../../../../tests/next-router';
import LanguageTeamClient from './page.client';

/**
 * The Team tab of a language nobody has joined yet. A new language starts here,
 * so the page has to say the team is empty rather than show a bare table, and
 * must not warn about a missing manager when there is nobody to promote.
 */

afterEach(cleanup);

const croatian = { id: 'lang-hr', code: 'hr', name: 'Croatian' };
const users = [{ id: 'user-1', name: 'Ana Horvat', email: 'ana@example.com' }];

function renderTeam(members: Parameters<typeof LanguageTeamClient>[0]['members']) {
  const { TestRouter } = createTestRouter('/languages/hr/team');
  render(
    <TestRouter>
      <LanguageTeamClient language={croatian} canAdminister members={members} users={users} />
    </TestRouter>,
  );
}

test('a language with no members says its team is empty', () => {
  renderTeam([]);

  assert.ok(screen.getByText('Nobody is on the Croatian team yet.'));
  assert.equal(screen.queryByText('No language manager.'), null);
  assert.ok(screen.getByRole('button', { name: /add member/i }));
});

test('a team with members but no manager warns that nobody can manage it', () => {
  renderTeam([
    {
      id: 'membership-1',
      userId: 'user-1',
      role: ProjectRole.TRANSLATOR,
      user: { id: 'user-1', name: 'Ana Horvat', email: 'ana@example.com', image: null },
      openWork: 0,
    },
  ]);

  assert.ok(screen.getByText('No language manager.'));
  assert.equal(screen.queryByText('Nobody is on the Croatian team yet.'), null);
});
