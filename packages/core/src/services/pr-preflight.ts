import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type { PrMetadata, PrTarget } from "../schemas/pr";
import { GhService } from "./gh.service";
import { GitService } from "./git.service";

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class PreflightFailure extends Schema.TaggedErrorClass<PreflightFailure>()(
  "PreflightFailure",
  {
    exitCode: Schema.Number,
    message: Schema.String,
    phase: Schema.String,
  }
) {}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface PreflightResult {
  readonly affinityMatch: boolean;
  readonly affinityWarning: string | null;
  readonly diff: string;
  readonly localRepoPath: string;
  readonly metadata: PrMetadata;
  readonly target: PrTarget;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract repository name from a git remote URL.
 *
 * Handles:
 * - SSH:   `git@github.com:owner/repo.git`
 * - HTTPS: `https://github.com/owner/repo.git`
 * - HTTPS: `https://github.com/owner/repo`
 */
const extractRepoNameFromRemote = (remote: string): string | null => {
  const match = remote.match(/[/:]([^/]+?)(?:\.git)?$/);
  return match?.[1] ?? null;
};

// ---------------------------------------------------------------------------
// Preflight pipeline
// ---------------------------------------------------------------------------

/**
 * Runs the strict fail-fast preflight sequence for a PR review:
 *
 * 1. Verify `gh` installed
 * 2. Verify `gh` auth for target host
 * 3. Verify local git repository
 * 4. Check repository affinity (warn if mismatch, fail if no repo)
 * 5. Fetch PR metadata and validate it has changed files
 * 6. Fetch PR diff
 */
export const runPreflight = Effect.fn("PrPreflight.run")(function* (
  target: PrTarget
) {
  const gh = yield* GhService;
  const git = yield* GitService;

  // Step 1: gh installed
  yield* gh.ensureInstalled.pipe(
    Effect.mapError(
      (e) =>
        new PreflightFailure({
          exitCode: 1,
          message: e.message,
          phase: "gh_install",
        })
    )
  );

  // Step 2: gh auth
  yield* gh.ensureAuthenticated(target.host).pipe(
    Effect.mapError(
      (e) =>
        new PreflightFailure({
          exitCode: 5,
          message: e.message,
          phase: "gh_auth",
        })
    )
  );

  // Step 3: local repo
  const localRepoPath = yield* git.getRepositoryPath.pipe(
    Effect.mapError(
      () =>
        new PreflightFailure({
          exitCode: 4,
          message:
            "Not inside a git repository. Navigate to a repo or use --repo.",
          phase: "repo_discovery",
        })
    )
  );

  // Step 4: affinity check
  const repoInfo = yield* git.getRepositoryInfo.pipe(
    Effect.mapError(
      () =>
        new PreflightFailure({
          exitCode: 1,
          message: "Could not read repository info.",
          phase: "repo_info",
        })
    )
  );

  let affinityMatch = false;
  let affinityWarning: string | null = null;

  if (repoInfo.remote) {
    const remoteRepo = extractRepoNameFromRemote(repoInfo.remote);
    if (remoteRepo?.toLowerCase() === target.repo.toLowerCase()) {
      affinityMatch = true;
    } else {
      affinityWarning = `PR is from ${target.nwoRef} but local remote points to ${repoInfo.remote}. Review will be stored in ${localRepoPath}/.ringi/`;
    }
  } else {
    affinityWarning = `Local repository has no remote configured. Review will be stored in ${localRepoPath}/.ringi/`;
  }

  // Step 5: fetch PR metadata
  const metadata = yield* gh.fetchPrMetadata(target).pipe(
    Effect.mapError(
      (e) =>
        new PreflightFailure({
          exitCode: 1,
          message: `PR not accessible: ${e.message}`,
          phase: "pr_fetch",
        })
    )
  );

  if (metadata.changedFiles === 0) {
    return yield* new PreflightFailure({
      exitCode: 1,
      message: `PR #${target.prNumber} has no changed files.`,
      phase: "pr_validation",
    });
  }

  // Step 6: fetch diff
  const diff = yield* gh.fetchPrDiff(target).pipe(
    Effect.mapError(
      (e) =>
        new PreflightFailure({
          exitCode: 1,
          message: `Failed to fetch PR diff: ${e.message}`,
          phase: "diff_fetch",
        })
    )
  );

  if (!diff.trim()) {
    return yield* new PreflightFailure({
      exitCode: 1,
      message: `PR #${target.prNumber} returned an empty diff.`,
      phase: "diff_fetch",
    });
  }

  return {
    affinityMatch,
    affinityWarning,
    diff,
    localRepoPath,
    metadata,
    target,
  } satisfies PreflightResult;
});
