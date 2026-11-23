import crypto from 'node:crypto';

/**
 * Publishing files to the content repository as one commit on its deploy
 * branch, kept apart from octokit so every decision can be tested without
 * GitHub.
 *
 * The branch only ever moves forward through `updateBranch`, which refuses
 * anything but a fast-forward. Two deploys running at once therefore cannot
 * lose each other's files: the one that loses the race finds the branch moved,
 * starts again from the new head, and commits on top of it.
 */

export interface PublishFile {
  path: string;
  content: string;
}

export interface BranchHead {
  commitSha: string;
  treeSha: string;
}

export interface PublishCommit {
  sha: string;
  url: string;
}

export interface PublishDeps {
  getHead: () => Promise<BranchHead>;
  /** The blob SHA of `path` at commit `ref`, or null when there is no such file. */
  getBlobSha: (path: string, ref: string) => Promise<string | null>;
  /** A new tree: `baseTree` with `files` written over it. */
  createTree: (baseTree: string, files: PublishFile[]) => Promise<string>;
  createCommit: (message: string, tree: string, parent: string) => Promise<PublishCommit>;
  /**
   * Moves the branch to `sha`, never by force. Throws GitHub's error, with its
   * HTTP `status`, when that is not a fast-forward.
   */
  updateBranch: (sha: string) => Promise<void>;
  wait: (ms: number) => Promise<void>;
}

export interface PublishResult {
  /** Null when every file already had this content, so no commit was made. */
  commit: PublishCommit | null;
  /** The paths the commit changed. The others were already up to date. */
  changedPaths: string[];
}

/**
 * Waits before each new attempt after the branch moved. A concurrent deploy
 * finishes in seconds, so a handful of attempts covers it; a branch still
 * moving after them is busier than this app makes it, and the deploy fails
 * with a message that says so rather than looping.
 */
export const BRANCH_MOVED_RETRY_DELAYS_MS = [250, 750, 1500] as const;

export const BRANCH_KEPT_MOVING =
  'The deploy branch kept changing while this deploy ran, so nothing was published. Try again.';

/** How many files are looked up on GitHub at once. */
const LOOKUP_CONCURRENCY = 5;

/** The SHA git gives a blob with this content, the same one GitHub reports. */
export function gitBlobSha(content: string): string {
  const body = Buffer.from(content, 'utf8');
  return crypto
    .createHash('sha1')
    .update(`blob ${body.length}\0`)
    .update(body)
    .digest('hex');
}

/**
 * Commits `files` to the deploy branch in one commit.
 *
 * Only files whose content differs from the branch go into the commit; when
 * none do, nothing is committed. That makes a deploy safe to repeat: the
 * second run of the same content is a no-op, not an empty commit.
 */
export async function publishFiles(
  deps: PublishDeps,
  files: PublishFile[],
  message: string,
): Promise<PublishResult> {
  for (let attempt = 0; ; attempt++) {
    const head = await deps.getHead();
    const changed = await filesThatDiffer(deps, files, head.commitSha);
    if (changed.length === 0) {
      return { commit: null, changedPaths: [] };
    }

    const tree = await deps.createTree(head.treeSha, changed);
    const commit = await deps.createCommit(message, tree, head.commitSha);
    try {
      await deps.updateBranch(commit.sha);
      return { commit, changedPaths: changed.map((file) => file.path) };
    } catch (error) {
      if (!isNotFastForward(error)) throw error;
      if (attempt >= BRANCH_MOVED_RETRY_DELAYS_MS.length) {
        throw new Error(BRANCH_KEPT_MOVING);
      }
      await deps.wait(BRANCH_MOVED_RETRY_DELAYS_MS[attempt]);
    }
  }
}

/**
 * GitHub answers 422 "Update is not a fast forward" when the branch moved
 * after this deploy read it. 409 is what some GitHub versions send instead.
 */
function isNotFastForward(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return status === 422 || status === 409;
}

async function filesThatDiffer(deps: PublishDeps, files: PublishFile[], ref: string): Promise<PublishFile[]> {
  const differs = await mapLimited(files, LOOKUP_CONCURRENCY, async (file) => {
    const current = await deps.getBlobSha(file.path, ref);
    return current !== gitBlobSha(file.content);
  });
  return files.filter((_, index) => differs[index]);
}

async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
