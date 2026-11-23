import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast, type ToastT } from 'sonner';
import { DocumentStatus } from '@/generated/prisma/enums';
import { createTestRouter } from '../../tests/next-router';
import { StatusDropdown } from './status-dropdown';
import { DEPLOY_ACTIONS, type DeployActions } from './deploy/use-deploy';
import type { updateDocumentVersionStatusAction } from '@/domain/document-version/document-version.actions';
import type { StatusChangeRefusal } from '@/domain/document-version/document-version.status-change';
import type { DeploymentView, DeployPreview } from '@/domain/deployment/deployment.types';

/**
 * What the status control does and says. Choosing Deploy runs a deploy, with
 * a confirmation first; every other choice is a status move.
 */

afterEach(cleanup);

/**
 * The toasts the control raised, read from sonner's own record rather than a
 * rendered Toaster: sonner measures toast heights in a loop that never
 * settles under happy-dom once the last toast is dismissed.
 */
let seenBefore = 0;
function toastsShown() {
  // A dismiss request carries no title; only raised toasts are of interest.
  return toast.getHistory().slice(seenBefore).filter((entry): entry is ToastT => 'title' in entry);
}
function toastTitles(): string[] {
  return toastsShown().map((entry) => String(entry.title));
}
function actionLabel(entry: ToastT | undefined): string | null {
  const action = entry?.action;
  return typeof action === 'object' && action !== null && 'label' in action ? String(action.label) : null;
}

type ChangeStatus = typeof updateDocumentVersionStatusAction;
type Outcome = Exclude<Awaited<ReturnType<ChangeStatus>>, StatusChangeRefusal>;

function outcome(partial: Partial<Outcome>): Outcome {
  return { version: { id: 'version-1' } as Outcome['version'], ...partial };
}

const preview: DeployPreview = {
  documents: [{ id: 'version-1', title: 'Day 2', languageName: 'Czech', status: DocumentStatus.APPROVED }],
  target: { repository: 'exodus/site', branch: 'main' },
  audioNotReady: 0,
  notPublished: 0,
  alreadyRunning: 0,
};

function finished(status: 'SUCCEEDED' | 'FAILED'): DeploymentView {
  const succeeded = status === 'SUCCEEDED';
  return {
    id: 'deployment-1',
    status,
    trigger: 'MANUAL',
    requestedBy: { id: 'user-admin', name: 'Admin', image: null },
    sourceProject: null,
    language: null,
    branch: 'main',
    commitSha: succeeded ? '0123456789abcdef' : null,
    commitUrl: succeeded ? 'https://github.example/commit/0123456' : null,
    error: succeeded ? null : 'GitHub refused the commit',
    createdAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    retryOfId: null,
    counts: {
      PENDING: 0,
      PUBLISHED: succeeded ? 1 : 0,
      UNCHANGED: 0,
      NOT_PUBLISHED: 0,
      SKIPPED: 0,
      FAILED: succeeded ? 0 : 1,
    },
    items: [
      {
        id: 'item-1',
        documentVersionId: 'version-1',
        title: 'Day 2',
        languageName: 'Czech',
        languageCode: 'cs',
        href: '/documents/exodus90/ex90-day-2/cs',
        outcome: succeeded ? 'PUBLISHED' : 'FAILED',
        filePath: 'cs/day-2.md',
        error: null,
      },
    ],
  };
}

function fakeDeployActions(ends: 'SUCCEEDED' | 'FAILED' = 'SUCCEEDED') {
  const deployed: string[][] = [];
  const actions: DeployActions = {
    ...DEPLOY_ACTIONS,
    preview: async () => preview,
    deployVersions: async (input) => {
      deployed.push((input as { versionIds: string[] }).versionIds);
      return { deploymentId: 'deployment-1', joined: false };
    },
    getDeployment: async () => finished(ends),
    retry: async () => ({ deploymentId: 'deployment-2', joined: false }),
  };
  return { actions, deployed };
}

function renderControl(props: {
  status: DocumentStatus;
  changeStatus?: ChangeStatus;
  deployActions?: DeployActions;
  onStatusChange?: (status: DocumentStatus) => void;
}) {
  // sonner keeps one history for the whole process; only this render's entries count.
  seenBefore = toast.getHistory().length;
  const { TestRouter } = createTestRouter('/documents/exodus90/ex90-day-2/cs');
  render(
    <TestRouter>
      <StatusDropdown
        currentStatus={props.status}
        versionId="version-1"
        canDeploy
        documentId="doc-1"
        onStatusChange={props.onStatusChange}
        changeStatus={props.changeStatus ?? (async () => outcome({}))}
        deployActions={props.deployActions ?? fakeDeployActions().actions}
      />
    </TestRouter>,
  );
  return userEvent.setup();
}

async function choose(user: ReturnType<typeof userEvent.setup>, from: string, item: RegExp) {
  await user.click(await screen.findByRole('button', { name: `Document status: ${from}` }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
}

test('Deploy asks first, naming where the document goes, and moves nothing yet', async () => {
  let moves = 0;
  const { actions, deployed } = fakeDeployActions();
  const user = renderControl({
    status: DocumentStatus.APPROVED,
    deployActions: actions,
    changeStatus: async () => {
      moves++;
      return outcome({});
    },
  });
  await choose(user, 'Approved', /Deploy/);

  const dialog = await screen.findByRole('alertdialog');
  assert.ok(await within(dialog).findByText('Deploy "Day 2"?'));
  assert.ok(within(dialog).getByText('exodus/site'));
  assert.deepEqual(deployed, []);
  assert.equal(moves, 0);
});

test('a confirmed deploy shows Deployed once it is published, and offers the commit', async () => {
  const moved: DocumentStatus[] = [];
  const { actions, deployed } = fakeDeployActions('SUCCEEDED');
  const user = renderControl({ status: DocumentStatus.APPROVED, deployActions: actions, onStatusChange: (s) => moved.push(s) });
  await choose(user, 'Approved', /Deploy/);
  await user.click(await within(await screen.findByRole('alertdialog')).findByRole('button', { name: 'Deploy' }));

  assert.ok(await screen.findByRole('button', { name: 'Document status: Deployed' }));
  assert.deepEqual(deployed, [['version-1']]);
  assert.deepEqual(moved, [DocumentStatus.DEPLOYED]);
  const success = toastsShown().find((entry) => entry.type === 'success');
  assert.equal(success?.title, 'Deployed "Day 2" to GitHub');
  assert.equal(actionLabel(success), 'View commit');
});

test('a deploy that failed leaves the document Approved and offers Retry', async () => {
  const moved: DocumentStatus[] = [];
  const { actions } = fakeDeployActions('FAILED');
  const user = renderControl({ status: DocumentStatus.APPROVED, deployActions: actions, onStatusChange: (s) => moved.push(s) });
  await choose(user, 'Approved', /Deploy/);
  await user.click(await within(await screen.findByRole('alertdialog')).findByRole('button', { name: 'Deploy' }));

  await new Promise((resolve) => setTimeout(resolve, 20));
  const failure = toastsShown().find((entry) => entry.type === 'error');
  assert.equal(failure?.title, 'Could not deploy "Day 2"');
  assert.equal(actionLabel(failure), 'Retry');
  assert.ok(screen.getByRole('button', { name: 'Document status: Approved' }));
  assert.deepEqual(moved, []);
});

test('cancelling the confirmation deploys nothing', async () => {
  const { actions, deployed } = fakeDeployActions();
  const user = renderControl({ status: DocumentStatus.APPROVED, deployActions: actions });
  await choose(user, 'Approved', /Deploy/);
  await user.click(await within(await screen.findByRole('alertdialog')).findByRole('button', { name: 'Cancel' }));

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(screen.queryByRole('alertdialog'), null);
  assert.deepEqual(deployed, []);
});

test('an approval in a project that deploys on approval follows that deploy', async () => {
  const followed: string[] = [];
  const { actions } = fakeDeployActions('SUCCEEDED');
  const user = renderControl({
    status: DocumentStatus.PENDING_REVIEW,
    deployActions: {
      ...actions,
      getDeployment: async (id) => {
        followed.push(id);
        return finished('SUCCEEDED');
      },
    },
    changeStatus: async () => outcome({ deploymentId: 'deployment-1' }),
  });
  await choose(user, 'In Review', /Approve/);

  assert.ok(await screen.findByRole('button', { name: 'Document status: Approved' }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(followed, ['deployment-1']);
  assert.ok(toastTitles().includes('Deployed "Day 2" to GitHub'));
});

test('a recording that failed on approval is reported', async () => {
  const user = renderControl({
    status: DocumentStatus.PENDING_REVIEW,
    changeStatus: async () => outcome({ audio: { status: 'failed', error: 'speech service down' } }),
  });
  await choose(user, 'In Review', /Approve/);
  assert.ok(await screen.findByRole('button', { name: 'Document status: Approved' }));
  assert.ok(toastTitles().includes('Audio generation failed: speech service down'));
});

test('a move the server refused is reported and the status stays', async () => {
  const moved: DocumentStatus[] = [];
  const user = renderControl({
    status: DocumentStatus.PENDING_REVIEW,
    changeStatus: async () => {
      throw new Error('Forbidden: requires member permission in language');
    },
    onStatusChange: (s) => moved.push(s),
  });
  await choose(user, 'In Review', /Approve/);
  await screen.findByRole('button', { name: 'Document status: In Review' });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(toastTitles().includes('Forbidden: requires member permission in language'));
  assert.deepEqual(moved, []);
});

test('a move refused because the page was stale shows the reason and the status the server has', async () => {
  const moved: DocumentStatus[] = [];
  const user = renderControl({
    status: DocumentStatus.PENDING_REVIEW,
    changeStatus: async () => ({
      refused: { message: 'The page now shows its current status.', currentStatus: DocumentStatus.DEPLOYED },
    }),
    onStatusChange: (s) => moved.push(s),
  });
  await choose(user, 'In Review', /Approve/);
  assert.ok(await screen.findByRole('button', { name: 'Document status: Deployed' }));
  assert.ok(toastTitles().includes('The page now shows its current status.'));
  assert.deepEqual(moved, [DocumentStatus.DEPLOYED]);
});

test('the team can take a deployed document back to Approved', async () => {
  const moves: DocumentStatus[] = [];
  const user = renderControl({
    status: DocumentStatus.DEPLOYED,
    changeStatus: async (_id, status) => {
      moves.push(status);
      return outcome({});
    },
  });
  await choose(user, 'Deployed', /Revoke deployment/);
  assert.ok(await screen.findByRole('button', { name: 'Document status: Approved' }));
  assert.deepEqual(moves, [DocumentStatus.APPROVED]);
});

function renderInProgress(props: { canChangeStatus?: boolean; onReviewRequested?: () => void }) {
  const { TestRouter } = createTestRouter('/documents/exodus90/ex90-day-2/cs');
  render(
    <TestRouter>
      <StatusDropdown
        currentStatus={DocumentStatus.IN_PROGRESS}
        versionId="version-1"
        canDeploy={false}
        documentId="doc-1"
        {...props}
      />
    </TestRouter>,
  );
}

test('a language team member who is not the translator can ask for feedback', async () => {
  let requested = 0;
  renderInProgress({ canChangeStatus: true, onReviewRequested: () => requested++ });
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /^Document status: / }));
  await user.click(await screen.findByRole('menuitem', { name: /Give me feedback/ }));
  assert.equal(requested, 1);
});

test('someone from another language cannot open the status control', async () => {
  renderInProgress({ canChangeStatus: false, onReviewRequested: () => {} });
  const trigger = await screen.findByRole('button', { name: /^Document status: / });
  assert.equal((trigger as HTMLButtonElement).disabled, true);
});
