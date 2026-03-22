import { execFile } from "node:child_process";

import * as HttpApiSchema from "@effect/platform/HttpApiSchema";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { DiffFile, DiffHunk } from "@/api/schemas/diff";
import type {
  CreateReviewInput,
  ReviewId,
  ReviewStatus,
  UpdateReviewInput,
} from "@/api/schemas/review";
import { ReviewNotFound } from "@/api/schemas/review";
import {
  ReviewFileRepo,
  parseHunks,
  serializeHunks,
} from "@/core/repos/review-file.repo";
import { ReviewRepo } from "@/core/repos/review.repo";
import { parseDiff, getDiffSummary } from "@/core/services/diff.service";
import { GitService } from "@/core/services/git.service";

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

// eslint-disable-next-line max-classes-per-file -- tagged error and service stay co-located for this domain module.
export class ReviewError extends Schema.TaggedError<ReviewError>()(
  "ReviewError",
  { code: Schema.String, message: Schema.String },
  HttpApiSchema.annotations({ status: 400 })
) {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get HEAD SHA via git rev-parse. */
const getHeadSha = (repoPath: string) =>
  Effect.tryPromise({
    catch: () =>
      new ReviewError({ code: "GIT_ERROR", message: "Failed to get HEAD" }),
    try: () =>
      new Promise<string>((resolve, reject) => {
        execFile(
          "git",
          ["rev-parse", "HEAD"],
          { cwd: repoPath },
          (err, stdout) => {
            if (err) {
              reject(err);
            } else {
              resolve(stdout.trim());
            }
          }
        );
      }),
  });

interface SnapshotData {
  repository?: Record<string, unknown>;
  files?: DiffFile[];
  version?: number;
}

/**
 * Parse snapshotData JSON. Handles both v1 and v2 formats gracefully.
 * v1: { files: DiffFile[], repository: {...} }
 * v2: { repository: {...}, version: 2 }
 */
const parseSnapshotData = (s: string): Effect.Effect<SnapshotData> =>
  Effect.try(() => JSON.parse(s) as SnapshotData).pipe(
    Effect.orElseSucceed((): SnapshotData => ({}))
  );

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ReviewService extends Effect.Service<ReviewService>()(
  "@ringi/ReviewService",
  {
    dependencies: [
      ReviewRepo.Default,
      ReviewFileRepo.Default,
      GitService.Default,
    ],
    effect: Effect.sync(() => {
      // -----------------------------------------------------------------------
      // create
      // -----------------------------------------------------------------------
      const create = Effect.fn("ReviewService.create")(function* create(
        input: CreateReviewInput
      ) {
        const git = yield* GitService;
        const repo = yield* ReviewRepo;
        const fileRepo = yield* ReviewFileRepo;

        const repoPath = yield* git.getRepositoryPath;
        const hasCommitsResult = yield* git.hasCommits;
        if (!hasCommitsResult) {
          return yield* new ReviewError({
            code: "NO_COMMITS",
            message: "Repository has no commits",
          });
        }

        let diffText: string;
        let baseRef: string | null = null;
        const { sourceType, sourceRef } = input;

        switch (sourceType) {
          case "staged": {
            diffText = yield* git.getStagedDiff;
            if (!diffText.trim()) {
              return yield* new ReviewError({
                code: "NO_STAGED_CHANGES",
                message: "No staged changes",
              });
            }
            baseRef = yield* getHeadSha(repoPath);
            break;
          }
          case "branch": {
            if (!sourceRef) {
              return yield* new ReviewError({
                code: "INVALID_SOURCE",
                message: "Branch name required",
              });
            }
            diffText = yield* git.getBranchDiff(sourceRef);
            baseRef = sourceRef;
            break;
          }
          case "commits": {
            if (!sourceRef) {
              return yield* new ReviewError({
                code: "INVALID_SOURCE",
                message: "Commit SHAs required",
              });
            }
            const shas = sourceRef
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            if (shas.length === 0) {
              return yield* new ReviewError({
                code: "INVALID_SOURCE",
                message: "No valid commit SHAs",
              });
            }
            diffText = yield* git.getCommitDiff(shas);
            baseRef = shas.at(-1) ?? null;
            break;
          }
          default: {
            return yield* new ReviewError({
              code: "INVALID_SOURCE",
              message: "Unsupported review source",
            });
          }
        }

        const files = parseDiff(diffText);
        if (files.length === 0) {
          return yield* new ReviewError({
            code: "NO_CHANGES",
            message: "No changes found",
          });
        }

        const repoInfo = yield* git.getRepositoryInfo;
        const reviewId = crypto.randomUUID() as ReviewId;
        const storeHunks = sourceType === "staged";

        const fileInputs = files.map((f) => ({
          additions: f.additions,
          deletions: f.deletions,
          filePath: f.newPath,
          hunksData: storeHunks ? serializeHunks(f.hunks as DiffHunk[]) : null,
          oldPath: f.oldPath !== f.newPath ? f.oldPath : null,
          reviewId,
          status: f.status,
        }));

        const snapshotData = JSON.stringify({
          repository: repoInfo,
          version: 2,
        });

        const review = yield* repo.create({
          baseRef,
          id: reviewId,
          repositoryPath: repoPath,
          snapshotData,
          sourceRef: sourceRef ?? null,
          sourceType,
          status: "in_progress",
        });

        yield* fileRepo.createBulk(fileInputs);

        return review;
      });

      // -----------------------------------------------------------------------
      // list
      // -----------------------------------------------------------------------
      const list = Effect.fn("ReviewService.list")(function* list(opts: {
        page?: number;
        pageSize?: number;
        status?: ReviewStatus;
        repositoryPath?: string;
        sourceType?: string;
      }) {
        const repo = yield* ReviewRepo;
        const fileRepo = yield* ReviewFileRepo;

        const page = opts.page ?? 1;
        const pageSize = opts.pageSize ?? 20;

        const result = yield* repo.findAll({
          page,
          pageSize,
          repositoryPath: opts.repositoryPath,
          sourceType: opts.sourceType,
          status: opts.status,
        });

        const reviews = [];
        for (const review of result.data) {
          const fileCount = yield* fileRepo.countByReview(review.id);
          const snapshot = yield* parseSnapshotData(review.snapshotData);
          reviews.push({
            ...review,
            fileCount,
            repository: snapshot.repository ?? null,
          });
        }

        return {
          hasMore: page * pageSize < result.total,
          page,
          pageSize,
          reviews,
          total: result.total,
        };
      });

      // -----------------------------------------------------------------------
      // getById
      // -----------------------------------------------------------------------
      const getById = Effect.fn("ReviewService.getById")(function* getById(
        id: ReviewId
      ) {
        const repo = yield* ReviewRepo;
        const fileRepo = yield* ReviewFileRepo;

        const review = yield* repo.findById(id);
        if (!review) {
          return yield* new ReviewNotFound({ id });
        }

        // findByReview returns metadata rows (snake_case from DB)
        const fileRows = yield* fileRepo.findByReview(id);
        const files = fileRows.map((r) => ({
          additions: r.additions,
          deletions: r.deletions,
          filePath: r.file_path,
          id: r.id,
          oldPath: r.old_path,
          status: r.status,
        }));

        const snapshot = yield* parseSnapshotData(review.snapshotData);
        const summary = getDiffSummary(
          files.map((f) => ({
            additions: f.additions,
            deletions: f.deletions,
            hunks: [],
            newPath: f.filePath,
            oldPath: f.oldPath ?? f.filePath,
            status: f.status as DiffFile["status"],
          }))
        );

        return {
          ...review,
          files,
          repository: snapshot.repository ?? null,
          summary,
        };
      });

      // -----------------------------------------------------------------------
      // getFileHunks — lazy load hunks for a single file
      // -----------------------------------------------------------------------
      const getFileHunks = Effect.fn("ReviewService.getFileHunks")(
        function* getFileHunks(reviewId: ReviewId, filePath: string) {
          const repo = yield* ReviewRepo;
          const fileRepo = yield* ReviewFileRepo;
          const git = yield* GitService;

          const review = yield* repo.findById(reviewId);
          if (!review) {
            return yield* new ReviewNotFound({ id: reviewId });
          }

          // Staged reviews store hunks in DB
          const fileRecord = yield* fileRepo.findByReviewAndPath(
            reviewId,
            filePath
          );
          if (fileRecord?.hunks_data) {
            return yield* parseHunks(fileRecord.hunks_data);
          }

          // Branch reviews: regenerate from git
          if (review.sourceType === "branch" && review.sourceRef) {
            const diff = yield* git.getBranchDiff(review.sourceRef);
            const diffFiles = parseDiff(diff);
            const file = diffFiles.find((f) => f.newPath === filePath);
            return (file?.hunks ?? []) as DiffHunk[];
          }

          // Commits reviews: regenerate from git
          if (review.sourceType === "commits" && review.sourceRef) {
            const shas = review.sourceRef.split(",").map((s) => s.trim());
            const diff = yield* git.getCommitDiff(shas);
            const diffFiles = parseDiff(diff);
            const file = diffFiles.find((f) => f.newPath === filePath);
            return (file?.hunks ?? []) as DiffHunk[];
          }

          // Legacy v1 fallback — hunks were embedded in snapshotData
          const snapshot = yield* parseSnapshotData(review.snapshotData);
          if (snapshot.files) {
            const legacyFile = snapshot.files.find(
              (f) => f.newPath === filePath
            );
            return (legacyFile?.hunks ?? []) as DiffHunk[];
          }

          return [] as DiffHunk[];
        }
      );

      // -----------------------------------------------------------------------
      // update
      // -----------------------------------------------------------------------
      const update = Effect.fn("ReviewService.update")(function* update(
        id: ReviewId,
        input: UpdateReviewInput
      ) {
        const repo = yield* ReviewRepo;

        const existing = yield* repo.findById(id);
        if (!existing) {
          return yield* new ReviewNotFound({ id });
        }

        const status = Option.getOrNull(input.status);
        const review = yield* repo.update(id, status);
        if (!review) {
          return yield* new ReviewNotFound({ id });
        }

        return review;
      });

      // -----------------------------------------------------------------------
      // remove
      // -----------------------------------------------------------------------
      const remove = Effect.fn("ReviewService.remove")(function* remove(
        id: ReviewId
      ) {
        const repo = yield* ReviewRepo;
        const fileRepo = yield* ReviewFileRepo;

        const existing = yield* repo.findById(id);
        if (!existing) {
          return yield* new ReviewNotFound({ id });
        }

        yield* fileRepo.deleteByReview(id);
        yield* repo.remove(id);

        return { success: true as const };
      });

      // -----------------------------------------------------------------------
      // getStats
      // -----------------------------------------------------------------------
      const getStats = Effect.fn("ReviewService.getStats")(
        function* getStats() {
          const repo = yield* ReviewRepo;

          const total = yield* repo.countAll();
          const inProgress = yield* repo.countByStatus("in_progress");
          const approved = yield* repo.countByStatus("approved");
          const changesRequested =
            yield* repo.countByStatus("changes_requested");

          return { approved, changesRequested, inProgress, total };
        }
      );

      // -----------------------------------------------------------------------
      // Public interface
      // -----------------------------------------------------------------------
      return {
        create,
        getById,
        getFileHunks,
        getStats,
        list,
        remove,
        update,
      } as const;
    }),
  }
) {}
