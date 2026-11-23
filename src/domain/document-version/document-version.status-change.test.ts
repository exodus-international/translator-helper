import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentStatus } from '@/generated/prisma/enums';
import {
  createStatusChange,
  guardedByOpenSuggestions,
  isDeployMove,
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
    startAutoDeploy: async (id) => {
      calls.push({ fn: 'startAutoDeploy', args: [id] });
      return null;
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
  it('knows only a move into DEPLOYED is a deploy', () => {
    assert.equal(isDeployMove(DocumentStatus.DEPLOYED), true);
    assert.equal(isDeployMove(DocumentStatus.APPROVED), false);
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
    assert.equal(result.audio, undefined);
    assert.equal(result.deploymentId, undefined);
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

describe('DEPLOYED is reached through Deploy', () => {
  it('refuses a move to DEPLOYED before writing anything, and says to use Deploy', async () => {
    const { changeStatus, calls } = fakeDeps();
    const error = await changeStatus({
      version: version(DocumentStatus.APPROVED),
      to: DocumentStatus.DEPLOYED,
      actorId: 'u',
    }).catch((caught: unknown) => caught);
    assert.deepEqual(calls, []);
    assert.match(toStatusChangeRefusal(error, DocumentStatus.APPROVED)?.refused.message ?? '', /Use Deploy/);
  });

  it('lets the team take a version back out of DEPLOYED', async () => {
    const { changeStatus } = fakeDeps();
    const result = await changeStatus({ version: version(DocumentStatus.DEPLOYED), to: DocumentStatus.APPROVED, actorId: 'u' });
    assert.equal(result.version.status, DocumentStatus.APPROVED);
  });
});

describe('deploying on approval', () => {
  it('starts the deploy after the recording and hands back the deployment to follow', async () => {
    const { changeStatus, calls } = fakeDeps({
      startAutoDeploy: async (id) => {
        calls.push({ fn: 'startAutoDeploy', args: [id] });
        return 'deployment-1';
      },
    });
    const result = await changeStatus({ version: version(DocumentStatus.PENDING_REVIEW), to: DocumentStatus.APPROVED, actorId: 'u' });
    assert.deepEqual(fns(calls), ['updateStatus', 'log:status_updated', 'notify', 'startAudio', 'revalidate', 'startAutoDeploy']);
    assert.equal(result.deploymentId, 'deployment-1');
  });

  it('says nothing about a deploy when the project does not deploy on approval', async () => {
    const { changeStatus } = fakeDeps();
    const result = await changeStatus({ version: version(DocumentStatus.PENDING_REVIEW), to: DocumentStatus.APPROVED, actorId: 'u' });
    assert.equal('deploymentId' in result, false);
  });

  it('keeps the approval when the deploy cannot start', async () => {
    const { changeStatus } = fakeDeps({
      startAutoDeploy: async () => {
        throw new Error('database down');
      },
    });
    const result = await changeStatus({ version: version(DocumentStatus.PENDING_REVIEW), to: DocumentStatus.APPROVED, actorId: 'u' });
    assert.equal(result.version.status, DocumentStatus.APPROVED);
    assert.equal(result.deploymentId, undefined);
  });

  it('does not redeploy a version whose deployment was just revoked', async () => {
    const { changeStatus, calls } = fakeDeps();
    await changeStatus({ version: version(DocumentStatus.DEPLOYED), to: DocumentStatus.APPROVED, actorId: 'u' });
    assert.equal(calls.some((call) => call.fn === 'startAutoDeploy'), false);
  });
});

describe('recording audio on entering APPROVED', () => {
  it('starts the recording and reports its outcome', async () => {
    const { changeStatus, calls } = fakeDeps();
    const result = await changeStatus({ version: version(DocumentStatus.PENDING_REVIEW), to: DocumentStatus.APPROVED, actorId: 'u' });
    assert.deepEqual(fns(calls), ['updateStatus', 'log:status_updated', 'notify', 'startAudio', 'revalidate', 'startAutoDeploy']);
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
