import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentStatus } from '@/generated/prisma/enums';
import { withStatusChangeFeedback, type StatusChangeFeedbackDeps, type StatusChangeOutcome } from './status-change-feedback';

type Call = { fn: string; args: unknown[] };

function fakeDeps() {
  const calls: Call[] = [];
  const record =
    (fn: string) =>
    (...args: unknown[]) => {
      calls.push({ fn, args });
      return fn === 'toast.loading' ? 'loading-1' : undefined;
    };
  const deps = {
    toast: {
      loading: record('toast.loading'),
      dismiss: record('toast.dismiss'),
      success: record('toast.success'),
      error: record('toast.error'),
    },
    capture: record('capture'),
    open: record('open'),
  } as unknown as StatusChangeFeedbackDeps;
  return { deps, calls };
}

const outcome = (partial: Partial<StatusChangeOutcome> = {}): StatusChangeOutcome =>
  ({ version: { id: 'version-1' }, ...partial }) as StatusChangeOutcome;

const deploy = { from: DocumentStatus.APPROVED, to: DocumentStatus.DEPLOYED, via: 'dropdown' as const, documentId: 'doc-1', versionId: 'version-1' };
const approve = { ...deploy, from: DocumentStatus.PENDING_REVIEW, to: DocumentStatus.APPROVED };

const fns = (calls: Call[]) => calls.map((call) => call.fn);

describe('withStatusChangeFeedback', () => {
  it('shows a loading toast for a deploy and clears it once the result is in', async () => {
    const { deps, calls } = fakeDeps();
    await withStatusChangeFeedback(deploy, async () => outcome({ github: { status: 'skipped' } }), deps);
    assert.deepEqual(calls[0], { fn: 'toast.loading', args: ['Deploying to GitHub...'] });
    assert.deepEqual(calls[1], { fn: 'toast.dismiss', args: ['loading-1'] });
  });

  it('shows no loading toast for a move that does not deploy', async () => {
    const { deps, calls } = fakeDeps();
    await withStatusChangeFeedback(approve, async () => outcome(), deps);
    assert.equal(calls.some((call) => call.fn.startsWith('toast.')), false);
  });

  it('reports a pull request and offers to open it', async () => {
    const { deps, calls } = fakeDeps();
    await withStatusChangeFeedback(
      deploy,
      async () => outcome({ github: { status: 'success', prUrl: 'https://github.example/pull/42' } }),
      deps,
    );
    const success = calls.find((call) => call.fn === 'toast.success');
    assert.equal(success?.args[0], 'GitHub PR created successfully');
    const options = success?.args[1] as { action: { label: string; onClick: () => void }; duration: number };
    assert.equal(options.action.label, 'Open PR');
    assert.equal(options.duration, 8000);
    options.action.onClick();
    assert.deepEqual(calls.at(-1), { fn: 'open', args: ['https://github.example/pull/42'] });
  });

  it('reports a deploy that committed without a pull request', async () => {
    const { deps, calls } = fakeDeps();
    await withStatusChangeFeedback(deploy, async () => outcome({ github: { status: 'success' } }), deps);
    const success = calls.find((call) => call.fn === 'toast.success');
    assert.equal(success?.args[0], 'Deployed to GitHub successfully');
    assert.equal((success?.args[1] as { action?: unknown }).action, undefined);
  });

  it('reports a failed deploy with its reason', async () => {
    const { deps, calls } = fakeDeps();
    await withStatusChangeFeedback(deploy, async () => outcome({ github: { status: 'failed', error: 'branch missing' } }), deps);
    assert.deepEqual(calls.find((call) => call.fn === 'toast.error'), {
      fn: 'toast.error',
      args: ['GitHub deploy failed: branch missing', { duration: 10000 }],
    });
  });

  it('says nothing about a deploy the app skipped', async () => {
    const { deps, calls } = fakeDeps();
    await withStatusChangeFeedback(deploy, async () => outcome({ github: { status: 'skipped' } }), deps);
    assert.deepEqual(fns(calls).filter((fn) => fn === 'toast.success' || fn === 'toast.error'), []);
  });

  it('records a recording that started, and reports one that failed', async () => {
    const { deps, calls } = fakeDeps();
    await withStatusChangeFeedback(approve, async () => outcome({ audio: { status: 'success', audioFileId: 'a1' } }), deps);
    assert.ok(calls.some((call) => call.fn === 'capture' && call.args[0] === 'audio_generation_triggered'));

    const failed = fakeDeps();
    await withStatusChangeFeedback(approve, async () => outcome({ audio: { status: 'failed', error: 'speech down' } }), failed.deps);
    assert.ok(failed.calls.some((call) => call.fn === 'capture' && call.args[0] === 'audio_generation_failed'));
    assert.ok(failed.calls.some((call) => call.fn === 'toast.error' && call.args[0] === 'Audio generation failed: speech down'));
  });

  it('tells analytics about every move, and about a deploy twice', async () => {
    const { deps, calls } = fakeDeps();
    await withStatusChangeFeedback({ ...deploy, via: 'kanban_dnd' }, async () => outcome({ github: { status: 'skipped' } }), deps);
    const events = calls.filter((call) => call.fn === 'capture').map((call) => call.args);
    assert.deepEqual(events, [
      ['document_status_changed', { from: DocumentStatus.APPROVED, to: DocumentStatus.DEPLOYED, via: 'kanban_dnd', documentId: 'doc-1', documentVersionId: 'version-1' }],
      ['document_deployed', { via: 'kanban_dnd', documentId: 'doc-1', documentVersionId: 'version-1' }],
    ]);
  });

  it('clears the loading toast and rethrows when the move fails', async () => {
    const { deps, calls } = fakeDeps();
    await assert.rejects(
      withStatusChangeFeedback(deploy, async () => {
        throw new Error('Forbidden');
      }, deps),
      /Forbidden/,
    );
    assert.deepEqual(fns(calls), ['toast.loading', 'toast.dismiss']);
  });
});
