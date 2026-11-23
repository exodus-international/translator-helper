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
    };
  const deps = {
    toast: { error: record('toast.error') },
    capture: record('capture'),
  } as unknown as StatusChangeFeedbackDeps;
  return { deps, calls };
}

const outcome = (partial: Partial<StatusChangeOutcome> = {}): StatusChangeOutcome =>
  ({ version: { id: 'version-1' }, ...partial }) as StatusChangeOutcome;

const approve = {
  from: DocumentStatus.PENDING_REVIEW,
  to: DocumentStatus.APPROVED,
  via: 'dropdown' as const,
  documentId: 'doc-1',
  versionId: 'version-1',
};

const fns = (calls: Call[]) => calls.map((call) => call.fn);

describe('withStatusChangeFeedback', () => {
  it('shows no toast for a move that went through', async () => {
    const { deps, calls } = fakeDeps();
    await withStatusChangeFeedback(approve, async () => outcome(), deps);
    assert.equal(calls.some((call) => call.fn.startsWith('toast.')), false);
  });

  it('hands the deploy that approval started to the page to follow', async () => {
    const { deps } = fakeDeps();
    const followed: string[] = [];
    await withStatusChangeFeedback(
      { ...approve, onDeployStarted: (id) => followed.push(id) },
      async () => outcome({ deploymentId: 'deployment-1' }),
      deps,
    );
    assert.deepEqual(followed, ['deployment-1']);
  });

  it('follows nothing when the project does not deploy on approval', async () => {
    const { deps } = fakeDeps();
    const followed: string[] = [];
    await withStatusChangeFeedback({ ...approve, onDeployStarted: (id) => followed.push(id) }, async () => outcome(), deps);
    assert.deepEqual(followed, []);
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

  it('tells analytics about every move', async () => {
    const { deps, calls } = fakeDeps();
    await withStatusChangeFeedback({ ...approve, via: 'kanban_dnd' }, async () => outcome(), deps);
    const events = calls.filter((call) => call.fn === 'capture').map((call) => call.args);
    assert.deepEqual(events, [
      [
        'document_status_changed',
        { from: DocumentStatus.PENDING_REVIEW, to: DocumentStatus.APPROVED, via: 'kanban_dnd', documentId: 'doc-1', documentVersionId: 'version-1' },
      ],
    ]);
  });

  it('rethrows when the move fails, and says nothing itself', async () => {
    const { deps, calls } = fakeDeps();
    await assert.rejects(
      withStatusChangeFeedback(approve, async () => {
        throw new Error('Forbidden');
      }, deps),
      /Forbidden/,
    );
    assert.deepEqual(calls, []);
  });

  it('shows a refusal as an error and sends no analytics', async () => {
    const { deps, calls } = fakeDeps();
    const result = await withStatusChangeFeedback(
      approve,
      async () => ({ refused: { message: 'Status changed meanwhile.', currentStatus: DocumentStatus.APPROVED } }),
      deps,
    );
    assert.deepEqual(fns(calls), ['toast.error']);
    assert.deepEqual(calls[0].args, ['Status changed meanwhile.']);
    assert.ok('refused' in result);
  });
});
