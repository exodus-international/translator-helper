import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DeploymentView } from '@/domain/deployment/deployment.types';
import {
  describeOutcome,
  FOLLOW_LIMIT_MS,
  followDeployment,
  retryAndFollow,
  type DeployFeedbackDeps,
} from './deploy-feedback';

type Outcome = DeploymentView['items'][number]['outcome'];

function view(status: DeploymentView['status'], outcomes: Outcome[], extra: Partial<DeploymentView> = {}): DeploymentView {
  const counts = { PENDING: 0, PUBLISHED: 0, UNCHANGED: 0, NOT_PUBLISHED: 0, SKIPPED: 0, FAILED: 0 };
  for (const outcome of outcomes) counts[outcome] += 1;
  return {
    id: 'deployment-1',
    status,
    trigger: 'MANUAL',
    requestedBy: null,
    sourceProject: null,
    language: null,
    branch: 'main',
    commitSha: null,
    commitUrl: null,
    error: null,
    createdAt: '2026-11-23T10:00:00.000Z',
    finishedAt: null,
    retryOfId: null,
    counts,
    items: outcomes.map((outcome, index) => ({
      id: `item-${index}`,
      documentVersionId: `version-${index}`,
      title: `Day ${index + 1}`,
      languageName: 'Czech',
      languageCode: 'cs',
      href: `/documents/x/day-${index + 1}/cs`,
      outcome,
      versionDeployed: outcome !== 'FAILED',
      filePath: null,
      error: null,
    })),
    ...extra,
  };
}

type Toast = {
  kind: string;
  message: string;
  options?: { id?: string | number; duration?: number; closeButton?: boolean; description?: string; action?: { label: string; onClick: () => void } };
};

function fakeDeps(views: (DeploymentView | null)[], overrides: Partial<DeployFeedbackDeps> = {}) {
  const toasts: Toast[] = [];
  const opened: string[] = [];
  const visited: string[] = [];
  let clock = 0;
  let reads = 0;
  const record = (kind: string) => (message: string, options?: Toast['options']) => {
    toasts.push({ kind, message, options });
    return options?.id ?? `toast-${toasts.length}`;
  };
  const deps: DeployFeedbackDeps = {
    toast: { loading: record('loading'), success: record('success'), error: record('error'), message: record('message') },
    getDeployment: async () => views[Math.min(reads++, views.length - 1)],
    retry: async () => ({ deploymentId: 'deployment-2', joined: false }),
    wait: async (ms) => {
      clock += ms;
    },
    now: () => clock,
    open: (url) => opened.push(url),
    navigate: (path) => visited.push(path),
    ...overrides,
  };
  return { deps, toasts, opened, visited, reads: () => reads };
}

describe('describeOutcome', () => {
  it('names the one document it published', () => {
    assert.equal(describeOutcome(view('SUCCEEDED', ['PUBLISHED'])).title, 'Deployed "Day 1" to GitHub');
  });

  it('counts a batch and notes the files that were already there', () => {
    const outcome = describeOutcome(view('SUCCEEDED', ['PUBLISHED', 'PUBLISHED', 'UNCHANGED']));
    assert.equal(outcome.title, 'Deployed 2 documents to GitHub');
    assert.equal(outcome.description, '1 already up to date.');
  });

  it('says a document is already up to date when nothing changed', () => {
    assert.equal(describeOutcome(view('SUCCEEDED', ['UNCHANGED'])).title, '"Day 1" is already up to date on GitHub');
  });

  it('says a document was marked deployed when its project publishes nowhere', () => {
    assert.equal(describeOutcome(view('SUCCEEDED', ['NOT_PUBLISHED'])).title, 'Marked "Day 1" deployed');
  });

  it('gives the reason a deploy failed, and how much of a batch still went out', () => {
    const outcome = describeOutcome(view('FAILED', ['PUBLISHED', 'FAILED', 'PENDING'], { error: 'GitHub is down' }));
    assert.equal(outcome.title, '2 of 3 documents were not deployed');
    assert.equal(describeOutcome(view('FAILED', ['PUBLISHED', 'FAILED'])).title, '1 of 2 documents was not deployed');
    assert.equal(outcome.description, 'GitHub is down 1 went out.');
  });
});

describe('followDeployment', () => {
  it('says there was nothing to deploy when the scope was empty', async () => {
    const { deps, toasts } = fakeDeps([]);
    let finished: unknown = 'not called';
    const result = await followDeployment({ deploymentId: null, joined: false }, { label: 'x', onFinished: (v) => (finished = v) }, deps);
    assert.equal(result, null);
    assert.equal(finished, null);
    assert.deepEqual(toasts.map((t) => t.message), ['Nothing to deploy']);
  });

  it('keeps one toast from "Deploying" through queued and publishing to the outcome, with the commit to open', async () => {
    const done = view('SUCCEEDED', ['PUBLISHED'], { commitUrl: 'https://github.example/commit/abc' });
    const { deps, toasts, opened } = fakeDeps([view('QUEUED', ['PENDING']), view('PUBLISHING', ['PENDING']), done]);
    const result = await followDeployment({ deploymentId: 'deployment-1', joined: false }, { label: '"Day 1"' }, deps);

    assert.equal(result, done);
    assert.deepEqual(toasts.map((t) => [t.kind, t.message, t.options?.description]), [
      ['loading', 'Deploying "Day 1"…', undefined],
      ['loading', 'Deploying "Day 1"…', 'Queued, about to start.'],
      ['loading', 'Deploying "Day 1"…', 'Publishing to GitHub.'],
      ['success', 'Deployed "Day 1" to GitHub', undefined],
    ]);
    assert.ok(toasts.slice(1).every((t) => t.options?.id === 'toast-1'));
    const success = toasts[3];
    assert.equal(success.options?.action?.label, 'View commit');
    success.options?.action?.onClick();
    assert.deepEqual(opened, ['https://github.example/commit/abc']);
  });

  it('says it joined a deploy that was already running', async () => {
    const { deps, toasts } = fakeDeps([view('SUCCEEDED', ['PUBLISHED'])]);
    await followDeployment({ deploymentId: 'deployment-1', joined: true }, { label: '"Day 1"' }, deps);
    assert.equal(toasts[0].message, 'Already deploying "Day 1"…');
  });

  it('offers Retry on a failure, which sends it again and follows the new deploy', async () => {
    const retried: string[] = [];
    const { deps, toasts } = fakeDeps([view('FAILED', ['FAILED'], { error: 'GitHub is down' }), view('SUCCEEDED', ['PUBLISHED'])], {
      retry: async (id) => {
        retried.push(id);
        return { deploymentId: 'deployment-2', joined: false };
      },
    });
    await followDeployment({ deploymentId: 'deployment-1', joined: false }, { label: '"Day 1"' }, deps);

    const failure = toasts.find((t) => t.kind === 'error');
    assert.equal(failure?.message, 'Could not deploy "Day 1"');
    assert.equal(failure?.options?.description, 'GitHub is down');
    assert.equal(failure?.options?.action?.label, 'Retry');
    assert.equal(failure?.options?.duration, Infinity, 'a failure stays until it is dismissed');
    assert.equal(failure?.options?.closeButton, true);

    failure?.options?.action?.onClick();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(retried, ['deployment-1']);
    assert.ok(toasts.some((t) => t.kind === 'success'));
  });

  it('stops waiting after the limit and says the deploy carries on', async () => {
    const { deps, toasts } = fakeDeps([view('PUBLISHING', ['PENDING'])]);
    let finished: unknown = 'not called';
    const result = await followDeployment({ deploymentId: 'deployment-1', joined: false }, { label: 'x', onFinished: (v) => (finished = v) }, deps);
    assert.equal(result, null);
    assert.equal(finished, null);
    assert.equal(toasts.at(-1)?.message, 'Still deploying');
    assert.ok(deps.now() > FOLLOW_LIMIT_MS);
  });

  it('says so when the deploy can no longer be read, and opens Deploys from the toast', async () => {
    const { deps, toasts, visited } = fakeDeps([null]);
    await followDeployment({ deploymentId: 'deployment-1', joined: false }, { label: 'x' }, deps);
    const last = toasts.at(-1);
    assert.equal(last?.message, 'Could not follow this deploy');
    assert.equal(last?.options?.duration, Infinity);
    last?.options?.action?.onClick();
    assert.deepEqual(visited, ['/deploys']);
  });
});

describe('retryAndFollow', () => {
  it('shows the reason a retry was refused', async () => {
    const { deps, toasts } = fakeDeps([], { retry: async () => ({ refused: { message: 'Every document in this deploy already went out.' } }) });
    assert.equal(await retryAndFollow('deployment-1', { label: 'x' }, deps), null);
    assert.deepEqual(toasts.map((t) => t.message), ['Every document in this deploy already went out.']);
  });
});
