import { execFile } from "node:child_process";

import * as HttpApiSchema from "@effect/platform/HttpApiSchema";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type {
  CreateReviewInput,
  ReviewId,
  ReviewStatus,
  UpdateReviewInput,
} from "@/api/schemas/review";
import { ReviewNotFound } from "@/api/schemas/review";
import type { DiffFile, DiffHunk } from "@/api/schemas/diff";

import { ReviewRepo } from "../repos/review.repo";
import { ReviewFileRepo, parseHunks, serializeHunks } from "../repos/review-file.repo";
import { GitService } from "./git.service";
import { parseDiff, getDiffSummary } from "./diff.service";

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class ReviewError extends Schema.TaggedError<ReviewError>()(
  "ReviewError",
  { message: Schema.String, code: Schema.String },
  HttpApiSchema.annotations({ status: 400 }),
) {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get HEAD SHA via git rev-parse. */
const getHeadSha = (repoPath: string) =>
  Effect.tryPromise({
    try: () =>
      new Promise<string>((resolve, reject) => {
        execFile(
          "git",
          ["rev-parse", "HEAD"],
          { cwd: repoPath },
          (err, stdout) => {
            if (err) reject(err);
            else resolve(stdout.trim());
          },
        );
      }),
    catch: () => new ReviewError({ message: "Failed to get HEAD", code: "GIT_ERROR" }),
  });

type SnapshotData = {
  repository?: Record<string, unknown>;
  files?: Array<DiffFile>;
  version?: number;
};

/**
 * Parse snapshotData JSON. Handles both v1 and v2 formats gracefully.
 * v1: { files: DiffFile[], repository: {...} }
 * v2: { repository: {...}, version: 2 }
 */
const parseSnapshotData = (s: string): Effect.Effect<SnapshotData> =>
  Effect.try(() => JSON.parse(s) as SnapshotData).pipe(
    Effect.orElseSucceed((): SnapshotData => ({})),
  );

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/** @effect-leakable-service */
export class ReviewService extends Effect.Service<ReviewService>()(
  "ReviewService",
  {
    dependencies: [ReviewRepo.Default, ReviewFileRepo.Default, GitService.Default],
    effect: Effect.gen(function* () {
      // -----------------------------------------------------------------------
      // create
      // -----------------------------------------------------------------------
      const create = (input: CreateReviewInput) =>
        Effect.gen(function* () {
          const git = yield* GitService;
          const repo = yield* ReviewRepo;
          const fileRepo = yield* ReviewFileRepo;

          const repoPath = yield* git.getRepositoryPath;
          const hasCommitsResult = yield* git.hasCommits;
          if (!hasCommitsResult) {
            return yield* new ReviewError({ message: "Repository has no commits", code: "NO_COMMITS" });
          }

          let diffText: string;
          let baseRef: string | null = null;
          const { sourceType, sourceRef } = input;

          switch (sourceType) {
            case "staged": {
              diffText = yield* git.getStagedDiff;
              if (!diffText.trim()) {
                return yield* new ReviewError({ message: "No staged changes", code: "NO_STAGED_CHANGES" });
              }
              baseRef = yield* getHeadSha(repoPath);
              break;
            }
            case "branch": {
              if (!sourceRef) {
                return yield* new ReviewError({ message: "Branch name required", code: "INVALID_SOURCE" });
              }
              diffText = yield* git.getBranchDiff(sourceRef);
              baseRef = sourceRef;
              break;
            }
            case "commits": {
              if (!sourceRef) {
                return yield* new ReviewError({ message: "Commit SHAs required", code: "INVALID_SOURCE" });
              }
              const shas = sourceRef
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              if (shas.length === 0) {
                return yield* new ReviewError({ message: "No valid commit SHAs", code: "INVALID_SOURCE" });
              }
              diffText = yield* git.getCommitDiff(shas);
              baseRef = shas[shas.length - 1] ?? null;
              break;
            }
          }

          const files = parseDiff(diffText);
          if (files.length === 0) {
            return yield* new ReviewError({ message: "No changes found", code: "NO_CHANGES" });
          }

          const repoInfo = yield* git.getRepositoryInfo;
          const reviewId = crypto.randomUUID() as ReviewId;
          const storeHunks = sourceType === "staged";

          const fileInputs = files.map((f) => ({
            reviewId,
            filePath: f.newPath,
            oldPath: f.oldPath !== f.newPath ? f.oldPath : null,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
            hunksData: storeHunks ? serializeHunks(f.hunks as Array<DiffHunk>) : null,
          }));

          const snapshotData = JSON.stringify({ repository: repoInfo, version: 2 });

          const review = yield* repo.create({
            id: reviewId,
            repositoryPath: repoPath,
            baseRef,
            sourceType,
            sourceRef: sourceRef ?? null,
            snapshotData,
            status: "in_progress",
          });

          yield* fileRepo.createBulk(fileInputs);

          return review;
        });

      // -----------------------------------------------------------------------
      // list
      // -----------------------------------------------------------------------
      const list = (opts: {
        page?: number;
        pageSize?: number;
        status?: ReviewStatus;
        repositoryPath?: string;
        sourceType?: string;
      }) =>
        Effect.gen(function* () {
          const repo = yield* ReviewRepo;
          const fileRepo = yield* ReviewFileRepo;

          const page = opts.page ?? 1;
          const pageSize = opts.pageSize ?? 20;

          const result = yield* repo.findAll({
            page,
            pageSize,
            status: opts.status,
            repositoryPath: opts.repositoryPath,
            sourceType: opts.sourceType,
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
            reviews,
            total: result.total,
            page,
            pageSize,
            hasMore: page * pageSize < result.total,
          };
        });

      // -----------------------------------------------------------------------
      // getById
      // -----------------------------------------------------------------------
      const getById = (id: ReviewId) =>
        Effect.gen(function* () {
          const repo = yield* ReviewRepo;
          const fileRepo = yield* ReviewFileRepo;

          const review = yield* repo.findById(id);
          if (!review) return yield* new ReviewNotFound({ id });

          // findByReview returns metadata rows (snake_case from DB)
          const fileRows = yield* fileRepo.findByReview(id);
          const files = fileRows.map((r) => ({
            id: r.id,
            filePath: r.file_path,
            oldPath: r.old_path,
            status: r.status,
            additions: r.additions,
            deletions: r.deletions,
          }));

          const snapshot = yield* parseSnapshotData(review.snapshotData);
          const summary = getDiffSummary(
            files.map((f) => ({
              oldPath: f.oldPath ?? f.filePath,
              newPath: f.filePath,
              status: f.status as DiffFile["status"],
              additions: f.additions,
              deletions: f.deletions,
              hunks: [],
            })),
          );

          return {
            ...review,
            files,
            summary,
            repository: snapshot.repository ?? null,
          };
        });

      // -----------------------------------------------------------------------
      // getFileHunks — lazy load hunks for a single file
      // -----------------------------------------------------------------------
      const getFileHunks = (reviewId: ReviewId, filePath: string) =>
        Effect.gen(function* () {
          const repo = yield* ReviewRepo;
          const fileRepo = yield* ReviewFileRepo;
          const git = yield* GitService;

          const review = yield* repo.findById(reviewId);
          if (!review) return yield* new ReviewNotFound({ id: reviewId });

          // Staged reviews store hunks in DB
          const fileRecord = yield* fileRepo.findByReviewAndPath(reviewId, filePath);
          if (fileRecord?.hunks_data) {
            return yield* parseHunks(fileRecord.hunks_data);
          }

          // Branch reviews: regenerate from git
          if (review.sourceType === "branch" && review.sourceRef) {
            const diff = yield* git.getBranchDiff(review.sourceRef);
            const diffFiles = parseDiff(diff);
            const file = diffFiles.find((f) => f.newPath === filePath);
            return (file?.hunks ?? []) as Array<DiffHunk>;
          }

          // Commits reviews: regenerate from git
          if (review.sourceType === "commits" && review.sourceRef) {
            const shas = review.sourceRef.split(",").map((s) => s.trim());
            const diff = yield* git.getCommitDiff(shas);
            const diffFiles = parseDiff(diff);
            const file = diffFiles.find((f) => f.newPath === filePath);
            return (file?.hunks ?? []) as Array<DiffHunk>;
          }

          // Legacy v1 fallback — hunks were embedded in snapshotData
          const snapshot = yield* parseSnapshotData(review.snapshotData);
          if (snapshot.files) {
            const legacyFile = snapshot.files.find((f) => f.newPath === filePath);
            return (legacyFile?.hunks ?? []) as Array<DiffHunk>;
          }

          return [] as Array<DiffHunk>;
        });

      // -----------------------------------------------------------------------
      // update
      // -----------------------------------------------------------------------
      const update = (id: ReviewId, input: UpdateReviewInput) =>
        Effect.gen(function* () {
          const repo = yield* ReviewRepo;

          const existing = yield* repo.findById(id);
          if (!existing) return yield* new ReviewNotFound({ id });

          const status = Option.getOrNull(input.status);
          const review = yield* repo.update(id, status);
          if (!review) return yield* new ReviewNotFound({ id });

          return review;
        });

      // -----------------------------------------------------------------------
      // remove
      // -----------------------------------------------------------------------
      const remove = (id: ReviewId) =>
        Effect.gen(function* () {
          const repo = yield* ReviewRepo;
          const fileRepo = yield* ReviewFileRepo;

          const existing = yield* repo.findById(id);
          if (!existing) return yield* new ReviewNotFound({ id });

          yield* fileRepo.deleteByReview(id);
          yield* repo.remove(id);

          return { success: true as const };
        });

      // -----------------------------------------------------------------------
      // getStats
      // -----------------------------------------------------------------------
      const getStats = Effect.gen(function* () {
        const repo = yield* ReviewRepo;

        const total = yield* repo.countAll();
        const inProgress = yield* repo.countByStatus("in_progress");
        const approved = yield* repo.countByStatus("approved");
        const changesRequested = yield* repo.countByStatus("changes_requested");

        return { total, inProgress, approved, changesRequested };
      });

      // -----------------------------------------------------------------------
      // Public interface
      // -----------------------------------------------------------------------
      return {
        create,
        list,
        getById,
        getFileHunks,
        update,
        remove,
        getStats,
      } as const;
    }),
  },
) {}
