import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MERGE_RETRY_DELAYS_MS, SUPERSEDED_REASON, mergePullRequest, type MergeDeps } from './github.merge';

/** An error shaped like octokit's RequestError, which carries the HTTP status. */
function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

function fakeDeps(answers: Array<{ sha: string } | Error>) {
  const merged: string[] = [];
  const waited: number[] = [];
  const deps: MergeDeps = {
    merge: async (headSha) => {
      merged.push(headSha);
      const answer = answers.shift();
      if (!answer) throw new Error('merge called more often than the test expected');
      if (answer instanceof Error) throw answer;
      return answer;
    },
    wait: async (ms) => {
      waited.push(ms);
    },
  };
  return { deps, merged, waited };
}

describe('mergePullRequest', () => {
  it('merges at the commit the deploy made', async () => {
    const { deps, merged, waited } = fakeDeps([{ sha: 'merge-sha' }]);
    assert.deepEqual(await mergePullRequest(deps, 'head-sha'), { merged: true, sha: 'merge-sha' });
    assert.deepEqual(merged, ['head-sha']);
    assert.deepEqual(waited, []);
  });

  it('waits out a pull request GitHub has not finished checking', async () => {
    const { deps, waited } = fakeDeps([httpError(405, 'Pull Request is not mergeable'), { sha: 'merge-sha' }]);
    assert.deepEqual(await mergePullRequest(deps, 'head-sha'), { merged: true, sha: 'merge-sha' });
    assert.deepEqual(waited, [MERGE_RETRY_DELAYS_MS[0]]);
  });

  it('gives up on a refusal that outlasts the retries, with GitHub’s reason', async () => {
    const refusal = httpError(405, 'At least 1 approving review is required');
    const { deps, merged, waited } = fakeDeps([refusal, refusal, refusal]);
    assert.deepEqual(await mergePullRequest(deps, 'head-sha'), {
      merged: false,
      reason: 'At least 1 approving review is required',
    });
    assert.equal(merged.length, MERGE_RETRY_DELAYS_MS.length + 1);
    assert.deepEqual(waited, [...MERGE_RETRY_DELAYS_MS]);
  });

  it('stands down when another deploy moved the branch first', async () => {
    const { deps, merged } = fakeDeps([httpError(409, 'Head branch was modified')]);
    assert.deepEqual(await mergePullRequest(deps, 'head-sha'), { merged: false, reason: SUPERSEDED_REASON });
    assert.equal(merged.length, 1);
  });

  it('reports any other failure without retrying or throwing', async () => {
    const { deps, merged } = fakeDeps([httpError(500, 'Server Error')]);
    assert.deepEqual(await mergePullRequest(deps, 'head-sha'), { merged: false, reason: 'Server Error' });
    assert.equal(merged.length, 1);
  });
});
