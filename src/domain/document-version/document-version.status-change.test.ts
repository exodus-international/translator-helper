import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentStatus } from '@/generated/prisma/enums';
import { DeploySkippedError } from '../github/github.errors';
import {
  createStatusChange,
  guardedByOpenSuggestions,
  involvesDeployed,
  toStatusChangeRefusal,
  type StatusChangeDeps,
} from './document-version.status-change';

type Call = { fn: string; args: unknown[] };
type Version = { id: string; status: DocumentStatus };

function fakeDeps(overrides: Partial<StatusChangeDeps<Version>> = {}) {
  const calls: Call[] = [];
  const deps: StatusChangeDeps<Version> = {
    countOpenSuggestions: async () => 0,
    updateStatus: async (id, status) => {
      calls.push({ fn: 'updateStatus', args: [id, status] });
      return { id, status };
    },
    log: async (entry) => {
      calls.push({ fn: `log:${entry.action}`, args: [entry.details] });
    },
    notify: async (input) => {
      calls.push({ fn: 'notify', args: [input.from, input.to] });
    },
    github: {
      isConfigured: () => true,
      deploy: async (id) => {
        calls.push({ fn: 'deploy', args: [id] });
        return { prUrl: 'https://github.example/pull/42' };
      },
    },
    startAudio: async (id) => {
      calls.push({ fn: 'startAudio', args: [id] });
      return { status: 'success', audioFileId: 'audio-1' };
    },
    revalidateDocumentPage: () => {
      calls.push({ fn: 'revalidate', args: [] });
    },
    ...overrides,
  };
  return { deps, calls, changeStatus: createStatusChange(deps) };
}

const version = (status: DocumentStatus): Version => ({ id: 'version-1', status });
const fns = (calls: Call[]) => calls.map((call) => call.fn);

describe('the two decisions the action asks before it loads anything', () => {
  it('knows a move in or out of DEPLOYED needs the language manager', () => {
    assert.equal(involvesDeployed(DocumentStatus.APPROVED, DocumentStatus.DEPLOYED), true);
    assert.equal(involvesDeployed(DocumentStatus.DEPLOYED, DocumentStatus.APPROVED), true);
    assert.equal(involvesDeployed(DocumentStatus.PENDING_REVIEW, DocumentStatus.APPROVED), false);
  });

  it('guards approval and deployment on open suggestions, and nothing else', () => {
    assert.equal(guardedByOpenSuggestions(DocumentStatus.APPROVED), true);
    assert.equal(guardedByOpenSuggestions(DocumentStatus.DEPLOYED), true);
    assert.equal(guardedByOpenSuggestions(DocumentStatus.PENDING_REVIEW), false);
  });
});

describe('changeStatus', () => {
  it('moves the version, logs it and tells the people involved, in that order', async () => {
    const { changeStatus, calls } = fakeDeps();
    const result = await changeStatus({
      version: version(DocumentStatus.PENDING_TRANSLATION),
      to: DocumentStatus.IN_PROGRESS,
      actorId: 'user-1',
    });
    assert.deepEqual(fns(calls), ['updateStatus', 'log:status_updated', 'notify']);
    assert.deepEqual(calls[2].args, [DocumentStatus.PENDING_TRANSLATION, DocumentStatus.IN_PROGRESS]);
    assert.equal(result.version.status, DocumentStatus.IN_PROGRESS);
    assert.equal(result.github, undefined);
    assert.equal(result.audio, undefined);
  });

  it('refuses a move the workflow does not allow, before writing anything', async () => {
    const { changeStatus, calls } = fakeDeps();
    await assert.rejects(
      changeStatus({ version: version(DocumentStatus.PENDING_TRANSLATION), to: DocumentStatus.APPROVED, actorId: 'u' }),
      /Invalid status transition/,
    );
    assert.deepEqual(calls, []);
  });

  it('refuses approval while a suggestion is open, before writing anything', async () => {
    const { changeStatus, calls } = fakeDeps({ countOpenSuggestions: async () => 2 });
    await assert.rejects(
      changeStatus({ version: version(DocumentStatus.PENDING_REVIEW), to: DocumentStatus.APPROVED, actorId: 'u' }),
      /2 open suggestions/,
    );
    assert.deepEqual(calls, []);
  });

  it('does not count suggestions for a move that is not guarded', async () => {
    let counted = false;
    const { changeStatus } = fakeDeps({
      countOpenSuggestions: async () => {
        counted = true;
        return 5;
      },
    });
    await changeStatus({ version: version(DocumentStatus.APPROVED), to: DocumentStatus.PENDING_REVIEW, actorId: 'u' });
    assert.equal(counted, false);
  });
});

describe('deploying on entering DEPLOYED', () => {
  it('deploys, logs the deploy, refreshes the page and reports the pull request', async () => {
    const { changeStatus, calls } = fakeDeps();
    const result = await changeStatus({ version: version(DocumentStatus.APPROVED), to: DocumentStatus.DEPLOYED, actorId: 'u' });
    assert.deepEqual(fns(calls), ['updateStatus', 'log:status_updated', 'notify', 'deploy', 'log:github_deployed', 'revalidate']);
    assert.deepEqual(result.github, { status: 'success', prUrl: 'https://github.example/pull/42' });
  });

  it('skips the deploy when GitHub is not configured, and says so', async () => {
    const { changeStatus, calls } = fakeDeps({ github: { isConfigured: () => false, deploy: async () => undefined } });
    const result = await changeStatus({ version: version(DocumentStatus.APPROVED), to: DocumentStatus.DEPLOYED, actorId: 'u' });
    assert.deepEqual(result.github, { status: 'skipped' });
    assert.equal(calls.some((call) => call.fn === 'deploy'), false);
    // The status change itself still happened.
    assert.equal(result.version.status, DocumentStatus.DEPLOYED);
  });

  it('treats a project the deploy declines as skipped, not failed', async () => {
    const { changeStatus, calls } = fakeDeps({
      github: {
        isConfigured: () => true,
        deploy: async () => {
          throw new DeploySkippedError('no repository directory');
        },
      },
    });
    const result = await changeStatus({ version: version(DocumentStatus.APPROVED), to: DocumentStatus.DEPLOYED, actorId: 'u' });
    assert.deepEqual(result.github, { status: 'skipped' });
    assert.equal(calls.some((call) => call.fn.startsWith('log:github')), false);
  });

  it('reports a failed deploy in the result and the log, and keeps the status', async () => {
    const { changeStatus, calls } = fakeDeps({
      github: {
        isConfigured: () => true,
        deploy: async () => {
          throw new Error('branch missing');
        },
      },
    });
    const result = await changeStatus({ version: version(DocumentStatus.APPROVED), to: DocumentStatus.DEPLOYED, actorId: 'u' });
    assert.deepEqual(result.github, { status: 'failed', error: 'branch missing' });
    assert.ok(calls.some((call) => call.fn === 'log:github_deploy_failed'));
    assert.equal(result.version.status, DocumentStatus.DEPLOYED);
  });

  it('does not deploy when leaving DEPLOYED', async () => {
    const { changeStatus, calls } = fakeDeps();
    const result = await changeStatus({ version: version(DocumentStatus.DEPLOYED), to: DocumentStatus.APPROVED, actorId: 'u' });
    assert.equal(calls.some((call) => call.fn === 'deploy'), false);
    assert.equal(result.github, undefined);
  });
});

describe('recording audio on entering APPROVED', () => {
  it('starts the recording and reports its outcome', async () => {
    const { changeStatus, calls } = fakeDeps();
    const result = await changeStatus({ version: version(DocumentStatus.PENDING_REVIEW), to: DocumentStatus.APPROVED, actorId: 'u' });
    assert.deepEqual(fns(calls), ['updateStatus', 'log:status_updated', 'notify', 'startAudio', 'revalidate']);
    assert.deepEqual(result.audio, { status: 'success', audioFileId: 'audio-1' });
  });

  it('never lets a speech outage undo an approval', async () => {
    const { changeStatus } = fakeDeps({
      startAudio: async () => {
        throw new Error('speech service down');
      },
    });
    const result = await changeStatus({ version: version(DocumentStatus.PENDING_REVIEW), to: DocumentStatus.APPROVED, actorId: 'u' });
    assert.deepEqual(result.audio, { status: 'failed', error: 'speech service down' });
    assert.equal(result.version.status, DocumentStatus.APPROVED);
  });

  it('also records when a deployment is revoked back to APPROVED', async () => {
    // Arriving at APPROVED from either side starts a recording. The audio
    // service decides for itself whether one is needed, so a revoke that
    // changes no text costs nothing.
    const { changeStatus, calls } = fakeDeps();
    await changeStatus({ version: version(DocumentStatus.DEPLOYED), to: DocumentStatus.APPROVED, actorId: 'u' });
    assert.equal(calls.some((call) => call.fn === 'startAudio'), true);
  });
});

describe('toStatusChangeRefusal', () => {
  it('turns a move from a stale page into a refusal that carries the real status', async () => {
    const { changeStatus } = fakeDeps();
    const error = await changeStatus({
      version: version(DocumentStatus.APPROVED),
      to: DocumentStatus.IN_PROGRESS,
      actorId: 'u',
    }).catch((caught: unknown) => caught);
    const refusal = toStatusChangeRefusal(error, DocumentStatus.APPROVED);
    assert.equal(refusal?.refused.currentStatus, DocumentStatus.APPROVED);
    assert.match(refusal?.refused.message ?? '', /status changed while you had it open/);
  });

  it('passes the open suggestions reason through as it is', async () => {
    const { changeStatus } = fakeDeps({ countOpenSuggestions: async () => 2 });
    const error = await changeStatus({
      version: version(DocumentStatus.PENDING_REVIEW),
      to: DocumentStatus.APPROVED,
      actorId: 'u',
    }).catch((caught: unknown) => caught);
    assert.match(toStatusChangeRefusal(error, DocumentStatus.PENDING_REVIEW)?.refused.message ?? '', /2 open suggestions/);
  });

  it('is not a refusal for any other failure', () => {
    assert.equal(toStatusChangeRefusal(new Error('database down'), DocumentStatus.APPROVED), null);
  });
});
