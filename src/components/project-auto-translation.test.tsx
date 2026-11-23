import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectAutoTranslation, { type ProjectAutoTranslationLoaders } from './project-auto-translation';
import type { AutoTranslationState } from '@/domain/auto-translation/auto-translation.actions';

/**
 * The AI translation card on the project page: the switch a language's
 * manager turns it on with, the count the confirmation states, and the
 * failures a manager can send back to the queue.
 */

afterEach(cleanup);

function state(overrides: Partial<AutoTranslationState> = {}): AutoTranslationState {
  return {
    translationProjectId: 'tp-fr',
    enabled: false,
    changedAt: null,
    candidates: 0,
    progress: { queued: 0, running: 0, succeeded: 0, failed: 0, failures: [] },
    ...overrides,
  };
}

function loaders(initial: AutoTranslationState) {
  const calls = { setEnabled: [] as unknown[], retry: [] as unknown[] };
  const fakes: ProjectAutoTranslationLoaders = {
    load: async () => initial,
    setEnabled: async (input) => {
      calls.setEnabled.push(input);
      return { queued: initial.candidates };
    },
    retry: async (input) => {
      calls.retry.push(input);
      return { queued: 1 };
    },
  };
  return { fakes, calls };
}

function renderCard(initial: AutoTranslationState, canManage: boolean) {
  const { fakes, calls } = loaders(initial);
  const view = render(
    <ProjectAutoTranslation
      translationProjectId="tp-fr"
      languageName="French"
      languageCode="fr"
      projectSlug="exodus90"
      canManage={canManage}
      loaders={fakes}
    />,
  );
  return { ...view, calls };
}

test('turning it on states how many documents it drafts before anything is queued', async () => {
  const { calls } = renderCard(state({ candidates: 3 }), true);
  const user = userEvent.setup();

  await user.click(await screen.findByRole('switch', { name: 'AI translation' }));

  const dialog = await screen.findByRole('alertdialog');
  assert.match(dialog.textContent ?? '', /draft 3 documents that nobody has started/);
  assert.deepEqual(calls.setEnabled, [], 'nothing changes until the manager confirms');

  await user.click(screen.getByRole('button', { name: 'Translate 3 documents' }));
  await waitFor(() => assert.deepEqual(calls.setEnabled, [{ translationProjectId: 'tp-fr', enabled: true }]));
});

test('cancelling the confirmation leaves the setting off', async () => {
  const { calls } = renderCard(state({ candidates: 2 }), true);
  const user = userEvent.setup();

  await user.click(await screen.findByRole('switch', { name: 'AI translation' }));
  await user.click(await screen.findByRole('button', { name: 'Cancel' }));

  assert.deepEqual(calls.setEnabled, []);
  assert.equal(screen.getByRole('switch', { name: 'AI translation' }).getAttribute('aria-checked'), 'false');
});

test('someone who cannot change it sees nothing while it is off and nothing was drafted', async () => {
  const { container } = renderCard(state({ candidates: 4 }), false);
  // Give the load a chance to land before asserting on its absence.
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(container.querySelector('[data-testid="auto-translation-card"]'), null);
});

const withFailure = state({
  enabled: true,
  progress: {
    queued: 0,
    running: 0,
    succeeded: 2,
    failed: 1,
    failures: [
      {
        id: 'job-1',
        error: 'The model took too long to answer.',
        finishedAt: new Date('2026-11-23T10:00:00Z'),
        document: { id: 'doc-1', title: 'Day 1 - The Call', slug: 'ex90-day-1' },
      },
    ],
  },
});

test('progress counts drafts against every document, and a manager can retry a failure', async () => {
  const { calls } = renderCard(withFailure, true);
  const user = userEvent.setup();

  assert.ok(await screen.findByText('2 of 3 translated'));
  assert.ok(screen.getByText('1 failed'));
  assert.ok(screen.getByText('The model took too long to answer.'));

  await user.click(screen.getByRole('button', { name: 'Retry Day 1 - The Call' }));
  await waitFor(() => assert.deepEqual(calls.retry, [{ translationProjectId: 'tp-fr', jobId: 'job-1' }]));
});

test('a team member sees the progress and failures but cannot retry', async () => {
  renderCard(withFailure, false);

  assert.ok(await screen.findByText('2 of 3 translated'));
  assert.ok(screen.getByText('On'));
  assert.equal(screen.queryByRole('switch'), null);
  assert.equal(screen.queryByRole('button', { name: /Retry/ }), null);
});
