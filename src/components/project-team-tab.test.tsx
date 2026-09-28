import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { cleanup, render, screen } from '@testing-library/react';
import ProjectTeamTab from './project-team-tab';

/**
 * The Team tab on a project page, for the two ways it can be empty: the
 * language has no translation project yet, or it has one but nobody has joined
 * the language team.
 */

afterEach(cleanup);

test('a language without a translation project says so instead of loading a roster', () => {
  let loads = 0;
  render(
    <ProjectTeamTab
      translationProjectId={null}
      canManage
      selectedLanguageName="Croatian"
      selectedLanguageCode="hr"
      loadMembers={async () => {
        loads += 1;
        return [];
      }}
    />,
  );

  assert.ok(screen.getByText('No translation project exists for Croatian'));
  assert.equal(loads, 0);
});

test('a translation project whose language has no team says the team is empty', async () => {
  render(
    <ProjectTeamTab
      translationProjectId="tp-hr"
      canManage
      selectedLanguageName="Croatian"
      selectedLanguageCode="hr"
      loadMembers={async () => []}
    />,
  );

  assert.ok(await screen.findByText('No team members yet'));
  assert.ok(screen.getByRole('heading', { name: 'Croatian team (0)' }));
  // Base UI renders the link with role="button", so it is found by its text.
  assert.equal(screen.getByText('Manage team').closest('a')?.getAttribute('href'), '/languages/hr/team');
});
