import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BRANCH_KEPT_MOVING,
  BRANCH_MOVED_RETRY_DELAYS_MS,
  gitBlobSha,
  publishFiles,
  type PublishDeps,
  type PublishFile,
} from './github.publish';

/** A branch held in memory: path → content at its head, moved only forward. */
function fakeRepository(initial: Record<string, string> = {}, options: { movesUnderneath?: number } = {}) {
  let files = { ...initial };
  let head = 'c0';
  let commits = 0;
  let moves = options.movesUnderneath ?? 0;
  const pending = new Map<string, Record<string, string>>();
  const calls: string[] = [];
  const waits: number[] = [];

  const deps: PublishDeps = {
    getHead: async () => ({ commitSha: head, treeSha: `tree-${head}` }),
    getBlobSha: async (path) => (path in files ? gitBlobSha(files[path]) : null),
    createTree: async (_base, changed) => {
      const tree = `tree-${commits + 1}`;
      pending.set(tree, Object.fromEntries(changed.map((file) => [file.path, file.content])));
      return tree;
    },
    createCommit: async (_message, tree, parent) => {
      commits += 1;
      calls.push(`commit:${parent}`);
      const sha = `c${commits}`;
      pending.set(sha, pending.get(tree)!);
      return { sha, url: `https://github.test/commit/${sha}` };
    },
    updateBranch: async (sha) => {
      if (moves > 0) {
        moves -= 1;
        head = `other-${moves}`;
        throw Object.assign(new Error('Update is not a fast forward'), { status: 422 });
      }
      files = { ...files, ...pending.get(sha)! };
      head = sha;
    },
    wait: async (ms) => {
      waits.push(ms);
    },
  };
  return { deps, calls, waits, files: () => files, head: () => head };
}

const file = (path: string, content: string): PublishFile => ({ path, content });

describe('gitBlobSha', () => {
  it('gives the SHA git gives the same content', () => {
    // `printf 'hello\n' | git hash-object --stdin`
    assert.equal(gitBlobSha('hello\n'), 'ce013625030ba8dba906f756967f9e9ca394464a');
  });
});

describe('publishFiles', () => {
  it('commits every changed file in one commit and moves the branch to it', async () => {
    const repo = fakeRepository({ 'a.md': 'old' });
    const result = await publishFiles(repo.deps, [file('a.md', 'new'), file('b.md', 'added')], 'Deploy');
    assert.equal(result.commit?.sha, 'c1');
    assert.deepEqual(result.changedPaths, ['a.md', 'b.md']);
    assert.deepEqual(repo.files(), { 'a.md': 'new', 'b.md': 'added' });
  });

  it('leaves files that already match out of the commit', async () => {
    const repo = fakeRepository({ 'a.md': 'same' });
    const result = await publishFiles(repo.deps, [file('a.md', 'same'), file('b.md', 'added')], 'Deploy');
    assert.deepEqual(result.changedPaths, ['b.md']);
  });

  it('makes no commit at all when nothing changed, so a deploy is safe to repeat', async () => {
    const repo = fakeRepository({ 'a.md': 'same' });
    const result = await publishFiles(repo.deps, [file('a.md', 'same')], 'Deploy');
    assert.deepEqual(result, { commit: null, changedPaths: [] });
    assert.deepEqual(repo.calls, []);
  });

  it('starts again from the new head when another deploy moved the branch first', async () => {
    const repo = fakeRepository({}, { movesUnderneath: 1 });
    const result = await publishFiles(repo.deps, [file('a.md', 'new')], 'Deploy');
    assert.equal(result.commit?.sha, 'c2');
    assert.deepEqual(repo.calls, ['commit:c0', 'commit:other-0']);
    assert.deepEqual(repo.waits, [BRANCH_MOVED_RETRY_DELAYS_MS[0]]);
  });

  it('gives up with a clear message when the branch never stops moving', async () => {
    const repo = fakeRepository({}, { movesUnderneath: BRANCH_MOVED_RETRY_DELAYS_MS.length + 1 });
    await assert.rejects(publishFiles(repo.deps, [file('a.md', 'new')], 'Deploy'), { message: BRANCH_KEPT_MOVING });
    assert.deepEqual(repo.files(), {});
  });

  it('passes any other GitHub error straight through', async () => {
    const repo = fakeRepository();
    repo.deps.updateBranch = async () => {
      throw Object.assign(new Error('Resource not accessible by integration'), { status: 403 });
    };
    await assert.rejects(publishFiles(repo.deps, [file('a.md', 'new')], 'Deploy'), /not accessible/);
  });
});
