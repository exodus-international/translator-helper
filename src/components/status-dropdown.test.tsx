import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast, type ToastT } from 'sonner';
import { DocumentStatus, Role } from '@/generated/prisma/enums';
import { createTestRouter } from '../../tests/next-router';
import { StatusDropdown } from './status-dropdown';
import type { updateDocumentVersionStatusAction } from '@/domain/document-version/document-version.actions';

/**
 * What the status control tells the person after a move, pinned before the
 * feedback code is shared with the kanban board. Every message here is the
 * one the control shows today.
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

const admin = { id: 'user-admin', email: 'admin@example.org', name: 'Admin', role: Role.ADMIN };

type ChangeStatus = typeof updateDocumentVersionStatusAction;
type Outcome = Awaited<ReturnType<ChangeStatus>>;

function outcome(partial: Partial<Outcome>): Outcome {
  return { version: { id: 'version-1' } as Outcome['version'], ...partial };
}

async function renderApproved(changeStatus: ChangeStatus, onStatusChange?: (status: DocumentStatus) => void) {
  // sonner keeps one history for the whole process; only this render's entries count.
  seenBefore = toast.getHistory().length;
  const { TestRouter } = createTestRouter('/documents/exodus90/ex90-day-2/cs');
  render(
    <TestRouter>
      <StatusDropdown
        currentStatus={DocumentStatus.APPROVED}
        versionId="version-1"
        user={admin}
        canDeploy
        documentId="doc-1"
        onStatusChange={onStatusChange}
        changeStatus={changeStatus}
      />
    </TestRouter>,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Document status: Approved' }));
  await user.click(await screen.findByRole('menuitem', { name: /Deploy/ }));
  return user;
}



test('a deploy that opened a pull request says so and offers to open it', async () => {
  const moved: DocumentStatus[] = [];
  await renderApproved(
    async () => outcome({ github: { status: 'success', prUrl: 'https://github.example/pull/42' } }),
    (status) => moved.push(status),
  );

  assert.ok(await screen.findByRole('button', { name: 'Document status: Deployed' }));
  const entry = toastsShown().find((item) => item.type === 'success');
  assert.equal(entry?.title, 'GitHub PR created successfully');
  const action = entry?.action;
  assert.equal(typeof action === 'object' && action !== null && 'label' in action ? action.label : null, 'Open PR');
  assert.deepEqual(moved, [DocumentStatus.DEPLOYED]);
});

test('a deploy that committed without a pull request still reports success', async () => {
  await renderApproved(async () => outcome({ github: { status: 'success' } }));
  assert.ok(await screen.findByRole('button', { name: 'Document status: Deployed' }));
  const entry = toastsShown().find((item) => item.type === 'success');
  assert.equal(entry?.title, 'Deployed to GitHub successfully');
  assert.equal(entry?.action, undefined);
});

test('a deploy GitHub refused is reported with its reason, and the status still moves', async () => {
  const moved: DocumentStatus[] = [];
  await renderApproved(
    async () => outcome({ github: { status: 'failed', error: 'branch missing' } }),
    (status) => moved.push(status),
  );
  assert.ok(await screen.findByRole('button', { name: 'Document status: Deployed' }));
  assert.ok(toastTitles().includes('GitHub deploy failed: branch missing'));
  assert.deepEqual(moved, [DocumentStatus.DEPLOYED]);
});

test('a deploy the app skipped says nothing about GitHub', async () => {
  await renderApproved(async () => outcome({ github: { status: 'skipped' } }));
  assert.ok(await screen.findByRole('button', { name: 'Document status: Deployed' }));
  // Only the "Deploying to GitHub..." loading toast was raised, and it is gone.
  assert.deepEqual(toastTitles(), ['Deploying to GitHub...']);
});

test('a recording that failed is reported beside the deploy result', async () => {
  await renderApproved(async () =>
    outcome({ github: { status: 'skipped' }, audio: { status: 'failed', error: 'speech service down' } }),
  );
  assert.ok(await screen.findByRole('button', { name: 'Document status: Deployed' }));
  assert.ok(toastTitles().includes('Audio generation failed: speech service down'));
});

test('a move the server refused is reported and the status stays', async () => {
  const moved: DocumentStatus[] = [];
  await renderApproved(
    async () => {
      throw new Error('Forbidden: requires manager permission in language');
    },
    (status) => moved.push(status),
  );
  await screen.findByRole('button', { name: 'Document status: Approved' });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(toastTitles().includes('Forbidden: requires manager permission in language'));
  assert.deepEqual(moved, []);
});
