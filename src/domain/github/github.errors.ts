/**
 * Thrown by `deployToGitHub` when the source project has no identifier, i.e.
 * GitHub deploy is off for it. Kept in its own file, free of the octokit
 * import in github.service.ts, so callers can check `instanceof` without
 * pulling in the GitHub client just to classify a caught error.
 */
export class DeploySkippedError extends Error {}
