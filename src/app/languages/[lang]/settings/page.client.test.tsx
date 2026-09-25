import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { cleanup, render, screen } from '@testing-library/react';
import { createTestRouter } from '../../../../../tests/next-router';
import LanguageSettingsClient from './page.client';

/**
 * The Settings tab of a language that was just added: no team, no branch, no
 * voice, no instructions. The health card is the only place that lists what is
 * still missing, so each gap has to be named there.
 */

afterEach(cleanup);

const brandNew = {
  id: 'lang-hr',
  code: 'hr',
  name: 'Croatian',
  isSource: false,
  branchName: null,
  audioProvider: null,
  audioVoice: null,
  translationInstructions: null,
};

function renderSettings(language = brandNew) {
  const { TestRouter } = createTestRouter('/languages/hr/settings');
  render(
    <TestRouter>
      <LanguageSettingsClient
        language={language}
        members={{ memberCount: 0, managerNames: [] }}
        deletionPlan={{ allowed: true, summary: 'Nothing depends on Croatian.', confirmationPhrase: 'delete hr' }}
      />
    </TestRouter>,
  );
}

test('a new language with no team lists every missing piece of setup', () => {
  renderSettings();

  assert.ok(screen.getByText('No members yet.', { exact: false }));
  for (const gap of ['No members', 'No language manager', 'No GitHub branch', 'No voice']) {
    assert.ok(screen.getByText(gap), `expected the health card to say "${gap}"`);
  }
});

test('the source language reports no gaps, because nothing translates into it', () => {
  renderSettings({ ...brandNew, code: 'en', name: 'English', isSource: true });

  assert.ok(screen.getByText('None of the four checks apply to the source language.'));
  assert.equal(screen.queryByText('No members'), null);
});
