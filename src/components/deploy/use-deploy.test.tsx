import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DocumentStatus } from '@/generated/prisma/enums';
import type { DeployPreview } from '@/domain/deployment/deployment.types';
import { createTestRouter } from '../../../tests/next-router';
import { DEPLOY_ACTIONS, useDeploy, type DeployActions } from './use-deploy';

/**
 * The confirmation for a batch: it lists every document with its language
 * and says what goes out without audio, before anything is sent.
 */

afterEach(cleanup);

// The document list scrolls; happy-dom has no Web Animations for the scroll area to ask.
Element.prototype.getAnimations ??= () => [];

const batch: DeployPreview = {
  documents: [
    { id: 'version-1', title: 'Day 2', languageName: 'Czech', status: DocumentStatus.APPROVED },
    { id: 'version-2', title: 'Day 3', languageName: 'Slovak', status: DocumentStatus.APPROVED },
  ],
  target: { repository: 'exodus/site', branch: 'main' },
  audioNotReady: 1,
  audioUnchecked: 0,
  notPublished: 0,
  alreadyRunning: 0,
};

function DeployApproved({ actions }: { actions: DeployActions }) {
  const { requestDeploy, dialog } = useDeploy({ actions });
  return (
    <>
      <button type="button" onClick={() => void requestDeploy({ scope: { languageId: 'cs' }, via: 'language' })}>
        Deploy approved
      </button>
      {dialog}
    </>
  );
}

test('a batch confirmation lists each document with its language and warns about missing audio', async () => {
  let sent = 0;
  const actions: DeployActions = {
    ...DEPLOY_ACTIONS,
    preview: async () => batch,
    deployScope: async () => {
      sent++;
      return { deploymentId: 'deployment-1', joined: false };
    },
  };
  const { TestRouter } = createTestRouter('/languages/cs');
  render(
    <TestRouter>
      <DeployApproved actions={actions} />
    </TestRouter>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Deploy approved' }));

  const dialog = await screen.findByRole('alertdialog');
  assert.ok(await within(dialog).findByText('Deploy 2 documents?'));
  const [documents] = within(dialog).getAllByRole('list');
  const rows = within(documents).getAllByRole('listitem').map((row) => row.textContent);
  assert.deepEqual(rows, ['Day 2Czech', 'Day 3Slovak']);
  assert.ok(within(dialog).getByText(/1 document has no up-to-date audio/));
  assert.ok(within(dialog).getByText('exodus/site'));
  assert.ok(within(dialog).getByRole('button', { name: 'Deploy 2 documents' }));
  assert.equal(sent, 0);
});
