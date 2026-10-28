import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  audioProvider: null as 'AZURE_SPEECH' | null,
  audioVoice: null as string | null,
  audioRate: null as string | null,
  audioPitch: null as string | null,
  audioSentencePauseMs: null as number | null,
  audioCommaPauseMs: null as number | null,
  audioQuality: null as 'STANDARD' | 'HIGH' | null,
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

const slovak = {
  ...brandNew,
  id: 'lang-sk',
  code: 'sk',
  name: 'Slovak',
  audioProvider: 'AZURE_SPEECH' as const,
  audioVoice: 'sk-SK-LukasNeural',
};

test('narration fields show the app default when nothing is stored', () => {
  renderSettings(slovak);

  const rate = screen.getByLabelText('Speaking rate') as HTMLInputElement;
  const pitch = screen.getByLabelText('Pitch') as HTMLInputElement;
  assert.equal(rate.value, '');
  assert.equal(rate.placeholder, '0.8');
  assert.equal(pitch.value, '');
  assert.equal(pitch.placeholder, '-6%');
});

test('narration fields show what the language stores', () => {
  renderSettings({ ...slovak, audioRate: '0.85', audioPitch: '-10%' });

  assert.equal((screen.getByLabelText('Speaking rate') as HTMLInputElement).value, '0.85');
  assert.equal((screen.getByLabelText('Pitch') as HTMLInputElement).value, '-10%');
});

test('pause fields show what the language stores', () => {
  renderSettings({ ...slovak, audioSentencePauseMs: 800, audioCommaPauseMs: 150 });

  assert.equal((screen.getByLabelText('Pause after sentence (ms)') as HTMLInputElement).value, '800');
  assert.equal((screen.getByLabelText('Pause after comma (ms)') as HTMLInputElement).value, '150');
});

test('reset to defaults empties the narration fields', () => {
  renderSettings({ ...slovak, audioRate: '0.85', audioPitch: '-10%', audioSentencePauseMs: 800, audioCommaPauseMs: 150 });

  fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));

  for (const label of ['Speaking rate', 'Pitch', 'Pause after sentence (ms)', 'Pause after comma (ms)']) {
    assert.equal((screen.getByLabelText(label) as HTMLInputElement).value, '', label);
  }
});

test('a language with no speech provider has no narration to tune', () => {
  renderSettings();

  assert.equal(screen.queryByLabelText('Speaking rate'), null);
});
