import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { ReviewFileRepo, serializeHunks } from "../repos/review-file.repo";
import { ReviewRepo } from "../repos/review.repo";
import type { DiffHunk } from "../schemas/diff";
import type { PrTarget } from "../schemas/pr";
import type { ReviewId } from "../schemas/review";
import { parseDiff, getDiffSummary } from "./diff.service";
import { GhService } from "./gh.service";
import type { PreflightResult } from "./pr-preflight";

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class PrSessionError extends Schema.TaggedErrorClass<PrSessionError>()(
  "PrSessionError",
  {
    code: Schema.String,
    message: Schema.String,
  }
) {}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface PrSessionResult {
  readonly isResumed: boolean;
  readonly isStale: boolean;
  readonly reviewId: ReviewId;
  readonly staleWarning: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Canonical source_ref for a PR: `host/owner/repo#number`. */
export const prSourceRef = (target: PrTarget): string =>
  `${target.host}/${target.owner}/${target.repo}#${target.prNumber}`;

interface StoredManifest {
  headOidAtFetch?: string;
}

const parseStoredManifest = (raw: string): StoredManifest => {
  try {
    return JSON.parse(raw) as StoredManifest;
  } catch {
    return {};
  }
};

// ---------------------------------------------------------------------------
// Create or resume
// ---------------------------------------------------------------------------

/**
 * Creates a new PR review session or resumes an existing non-terminal one.
 *
 * Resume logic:
 * - Looks for an existing review with `source_type = "pull_request"` and
 *   matching `source_ref`.
 * - If found and non-terminal (`in_progress` or `changes_requested`):
 *   resumes, checking for upstream drift via head OID comparison.
 * - If found but terminal (`approved`): creates a new session.
 * - If not found: creates a new session.
 *
 * New sessions persist the full diff as hunks in `review_files`, making
 * the review fully offline-resumable after initial fetch.
 */
export const createOrResumePrSession = Effect.fn("PrSession.createOrResume")(
  function* (preflight: PreflightResult) {
    const gh = yield* GhService;
    const repo = yield* ReviewRepo;
    const fileRepo = yield* ReviewFileRepo;
    const { target, metadata, diff } = preflight;

    const sourceRef = prSourceRef(target);

    // ----- Check for existing session ----------------------------------------

    const existing = yield* repo.findAll({
      repositoryPath: preflight.localRepoPath,
      sourceType: "pull_request",
      pageSize: 100,
    });

    const resumable = existing.data.find(
      (r) => r.sourceRef === sourceRef && r.status !== "approved"
    );

    if (resumable) {
      // Check for upstream drift — fallback to fetched OID if offline
      const currentHeadOid = yield* gh
        .fetchPrHeadOid(target)
        .pipe(
          Effect.catch((e) =>
            Effect.logDebug(
              `Could not fetch current head OID for drift check: ${e.message}`
            ).pipe(Effect.as(metadata.headRefOid))
          )
        );

      const manifest = parseStoredManifest(resumable.snapshotData);
      const storedHeadOid = manifest.headOidAtFetch ?? "";
      const isStale = storedHeadOid !== "" && storedHeadOid !== currentHeadOid;

      return {
        isResumed: true,
        isStale,
        reviewId: resumable.id,
        staleWarning: isStale
          ? `PR head has changed (${storedHeadOid.slice(0, 7)} → ${currentHeadOid.slice(0, 7)}). Review data reflects the previous version. Use --force-refresh to re-fetch.`
          : null,
      } satisfies PrSessionResult;
    }

    // ----- Create new session ------------------------------------------------

    const files = parseDiff(diff);
    if (files.length === 0) {
      return yield* new PrSessionError({
        code: "NO_CHANGES",
        message: `PR #${target.prNumber} diff parsed to zero files.`,
      });
    }

    const reviewId = crypto.randomUUID() as ReviewId;

    const snapshotData = JSON.stringify({
      diffByteSize: Buffer.byteLength(diff, "utf8"),
      fetchedAt: new Date().toISOString(),
      headOidAtFetch: metadata.headRefOid,
      metadata,
      source: "pull_request",
      target,
      version: 1,
    });

    // PR reviews always persist hunks for offline resumability
    const fileInputs = files.map((f) => ({
      additions: f.additions,
      deletions: f.deletions,
      filePath: f.newPath,
      hunksData: serializeHunks(f.hunks as DiffHunk[]),
      oldPath: f.oldPath !== f.newPath ? f.oldPath : null,
      reviewId,
      status: f.status,
    }));

    yield* repo.create({
      baseRef: metadata.baseRefOid,
      id: reviewId,
      repositoryPath: preflight.localRepoPath,
      snapshotData,
      sourceRef,
      sourceType: "pull_request",
      status: "in_progress",
    });

    yield* fileRepo.createBulk(fileInputs);

    return {
      isResumed: false,
      isStale: false,
      reviewId,
      staleWarning: null,
    } satisfies PrSessionResult;
  }
);

// ---------------------------------------------------------------------------
// Force refresh
// ---------------------------------------------------------------------------

/**
 * Re-fetches PR data for an existing session and updates stored diff/metadata.
 * Existing annotations are preserved (re-anchoring is a v1.1 feature).
 */
export const forceRefreshPrSession = Effect.fn("PrSession.forceRefresh")(
  function* (reviewId: ReviewId, target: PrTarget) {
    const gh = yield* GhService;
    const repo = yield* ReviewRepo;
    const fileRepo = yield* ReviewFileRepo;

    const review = yield* repo.findById(reviewId);
    if (!review) {
      return yield* new PrSessionError({
        code: "NOT_FOUND",
        message: `Review session ${reviewId} not found.`,
      });
    }

    // Fetch fresh data
    const metadata = yield* gh.fetchPrMetadata(target);
    const diff = yield* gh.fetchPrDiff(target);
    const files = parseDiff(diff);

    const snapshotData = JSON.stringify({
      diffByteSize: Buffer.byteLength(diff, "utf8"),
      fetchedAt: new Date().toISOString(),
      headOidAtFetch: metadata.headRefOid,
      metadata,
      source: "pull_request",
      target,
      version: 1,
    });

    // Update review row
    yield* repo.updateSnapshotData(reviewId, snapshotData);

    // Replace file rows (annotations are in a separate table, preserved)
    yield* fileRepo.deleteByReview(reviewId);

    const fileInputs = files.map((f) => ({
      additions: f.additions,
      deletions: f.deletions,
      filePath: f.newPath,
      hunksData: serializeHunks(f.hunks as DiffHunk[]),
      oldPath: f.oldPath !== f.newPath ? f.oldPath : null,
      reviewId,
      status: f.status,
    }));

    yield* fileRepo.createBulk(fileInputs);

    return {
      filesUpdated: files.length,
      headOid: metadata.headRefOid,
      reviewId,
      summary: getDiffSummary(files),
    };
  }
);
