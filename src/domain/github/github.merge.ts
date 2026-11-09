/**
 * Merging a deploy's pull request, kept apart from the octokit client so the
 * decisions can be tested without GitHub.
 */

export type MergeOutcome = { merged: true; sha: string } | { merged: false; reason: string };

export interface MergeDeps {
  /**
   * Merges the pull request, but only while its head is still `headSha`.
   * Throws GitHub's error, with its HTTP `status`, when it will not.
   */
  merge: (headSha: string) => Promise<{ sha: string }>;
  wait: (ms: number) => Promise<void>;
}

/**
 * GitHub works out whether a pull request can be merged after it is opened or
 * pushed to, and answers 405 until it has. A few seconds covers that; a 405
 * that outlasts them is a real refusal, such as a required check or review.
 */
export const MERGE_RETRY_DELAYS_MS = [1000, 2000] as const;

/** Said when another deploy pushed to the branch first; its own merge carries this commit. */
export const SUPERSEDED_REASON = 'Another deploy pushed to the branch before this one merged, and merging it publishes this one too';

/**
 * Merges the pull request at `headSha`, the commit this deploy made.
 *
 * Pinning the head means a deploy never merges a commit it has not seen: if a
 * second deploy for the same language pushed in between, GitHub answers 409
 * and this one stands down, because the second deploy's merge includes it.
 *
 * Never throws. A merge that does not happen leaves the pull request open,
 * which is where a deploy stood before merging existed, so the caller reports
 * it rather than failing the deploy.
 */
export async function mergePullRequest(deps: MergeDeps, headSha: string): Promise<MergeOutcome> {
  for (let attempt = 0; ; attempt++) {
    try {
      const { sha } = await deps.merge(headSha);
      return { merged: true, sha };
    } catch (error) {
      const status = (error as { status?: unknown } | null)?.status;
      if (status === 409) {
        return { merged: false, reason: SUPERSEDED_REASON };
      }
      if (status === 405 && attempt < MERGE_RETRY_DELAYS_MS.length) {
        await deps.wait(MERGE_RETRY_DELAYS_MS[attempt]);
        continue;
      }
      return { merged: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }
}
