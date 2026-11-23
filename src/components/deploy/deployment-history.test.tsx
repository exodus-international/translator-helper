import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeploymentItemView, DeploymentView } from '@/domain/deployment/deployment.types';
import { DeploymentHistory } from './deployment-history';

/**
 * On a document's page each row tells that document's own outcome. A batch
 * lists its documents in its own order, so the document's item is found by
 * its version, never taken as the first one.
 */

afterEach(cleanup);

function item(documentVersionId: string, outcome: DeploymentItemView['outcome'], error: string | null = null): DeploymentItemView {
  return {
    id: `item-${documentVersionId}`,
    documentVersionId,
    title: documentVersionId === 'this-version' ? 'Day 2' : 'Day 3',
    languageName: 'Czech',
    languageCode: 'cs',
    href: `/documents/exodus90/${documentVersionId}/cs`,
    outcome,
    versionDeployed: outcome !== 'FAILED',
    filePath: null,
    error,
  };
}

/** A two-document batch that failed: the other document first, this one second. */
function batch(thisOutcome: DeploymentItemView['outcome'], thisError: string | null = null): DeploymentView {
  return {
    id: 'deployment-1',
    status: 'FAILED',
    trigger: 'MANUAL',
    requestedBy: { id: 'user-1', name: 'Ana', image: null },
    sourceProject: null,
    language: null,
    branch: 'main',
    commitSha: null,
    commitUrl: null,
    error: 'Day 3 has no file name to publish under.',
    createdAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    retryOfId: null,
    counts: { PENDING: 0, PUBLISHED: 0, UNCHANGED: 0, NOT_PUBLISHED: 0, SKIPPED: 0, FAILED: 1, [thisOutcome]: 1 },
    items: [item('other-version', 'FAILED', 'Day 3 has no file name to publish under.'), item('this-version', thisOutcome, thisError)],
  };
}

function renderHistory(deployment: DeploymentView) {
  render(
    <DeploymentHistory deployments={[deployment]} canRetry onRetry={() => {}} documentVersionId="this-version" />,
  );
}

test('a batch that failed on another document reads as deployed for this one, with no retry', () => {
  renderHistory(batch('UNCHANGED'));

  assert.ok(screen.getByText('Deployed'));
  assert.ok(screen.getByText(/Up to date/));
  assert.equal(screen.queryByText('Failed'), null);
  assert.equal(screen.queryByText('Day 3 has no file name to publish under.'), null);
  assert.equal(screen.queryByRole('button', { name: /Retry/ }), null);
});

test('a batch that failed on this document shows its own error and offers a retry', () => {
  renderHistory(batch('FAILED', 'GitHub refused the commit'));

  assert.ok(screen.getByText('Failed'));
  assert.ok(screen.getByText('GitHub refused the commit'));
  assert.equal(screen.queryByText('Day 3 has no file name to publish under.'), null);
  assert.ok(screen.getByRole('button', { name: /Retry/ }));
});

test('without a document, the row tells the whole batch and lists its documents', () => {
  render(<DeploymentHistory deployments={[batch('PUBLISHED')]} canRetry onRetry={() => {}} />);

  assert.ok(screen.getByText('Failed'));
  assert.ok(screen.getByText('Day 3 has no file name to publish under.'));
  assert.ok(screen.getByText('2 documents'));
  assert.ok(screen.getByRole('button', { name: /Retry/ }));
});

test('a retry names the documents it sends again', async () => {
  const retried: [string, string][] = [];
  render(
    <DeploymentHistory
      deployments={[batch('UNCHANGED')]}
      canRetry
      onRetry={(id, label) => retried.push([id, label])}
    />,
  );
  await userEvent.setup().click(screen.getByRole('button', { name: /Retry/ }));

  assert.deepEqual(retried, [['deployment-1', '"Day 3" (Czech) again']]);
});
