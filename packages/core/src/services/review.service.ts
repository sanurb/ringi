import { execFile } from "node:child_process";

import { ServiceMap } from "effect";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import {
  ReviewFileRepo,
  parseHunks,
  serializeHunks,
} from "../repos/review-file.repo";
import { ReviewRepo } from "../repos/review.repo";
import type { DiffFile, DiffHunk } from "../schemas/diff";
import type {
  CreateReviewInput,
  ReviewId,
  ReviewStatus,
  UpdateReviewInput,
} from "../schemas/review";
import { ReviewNotFound } from "../schemas/review";
import { parseDiff, getDiffSummary } from "../services/diff.service";
import { GitService } from "../services/git.service";

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class ReviewError extends Schema.TaggedErrorClass<ReviewError>()(
  "ReviewError",
  { code: Schema.String, message: Schema.String }
) {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

const parseSnapshotData = (s: string): Effect.Effect<SnapshotData> =>
  Effect.try({
    try: () => JSON.parse(s) as SnapshotData,
    catch: () => ({}) as SnapshotData,
  }).pipe(Effect.orElseSucceed((): SnapshotData => ({})));

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ReviewService extends ServiceMap.Service<
  ReviewService,
  {
    create(
      input: CreateReviewInput
    ): Effect.Effect<
      any,
      ReviewError | ReviewNotFound | import("./git.service").GitError
    >;
    list(opts: {
      page?: number;
      pageSize?: number;
      status?: ReviewStatus;
      repositoryPath?: string;
      sourceType?: string;
    }): Effect.Effect<any>;
    getById(id: ReviewId): Effect.Effect<any, ReviewNotFound>;
    getFileHunks(
      reviewId: ReviewId,
      filePath: string
    ): Effect.Effect<
      readonly DiffHunk[],
      ReviewNotFound | import("./git.service").GitError
    >;
    update(
      id: ReviewId,
      input: UpdateReviewInput
    ): Effect.Effect<any, ReviewNotFound>;
    remove(id: ReviewId): Effect.Effect<{ success: true }, ReviewNotFound>;
    getStats(): Effect.Effect<{
      approved: number;
      changesRequested: number;
      inProgress: number;
      total: number;
    }>;
  }
>()("@ringi/ReviewService") {
  static readonly Default: Layer.Layer<
    ReviewService,
    never,
    ReviewRepo | ReviewFileRepo | GitService
  > = Layer.effect(
    ReviewService,
    Effect.gen(function* () {
      const git = yield* GitService;
      const repo = yield* ReviewRepo;
      const fileRepo = yield* ReviewFileRepo;

      const create = (input: CreateReviewInput) =>
        Effect.gen(function* () {
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
            hunksData: storeHunks
              ? serializeHunks(f.hunks as DiffHunk[])
              : null,
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

      const list = (opts: {
        page?: number;
        pageSize?: number;
        status?: ReviewStatus;
        repositoryPath?: string;
        sourceType?: string;
      }) =>
        Effect.gen(function* () {
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

      const getById = (id: ReviewId) =>
        Effect.gen(function* () {
          const review = yield* repo.findById(id);
          if (!review) {
            return yield* new ReviewNotFound({ id });
          }

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

      const getFileHunks = (reviewId: ReviewId, filePath: string) =>
        Effect.gen(function* () {
          const review = yield* repo.findById(reviewId);
          if (!review) {
            return yield* new ReviewNotFound({ id: reviewId });
          }

          const fileRecord = yield* fileRepo.findByReviewAndPath(
            reviewId,
            filePath
          );
          if (fileRecord?.hunks_data) {
            return yield* parseHunks(fileRecord.hunks_data);
          }

          if (review.sourceType === "branch" && review.sourceRef) {
            const diff = yield* git.getBranchDiff(review.sourceRef);
            const diffFiles = parseDiff(diff);
            const file = diffFiles.find((f) => f.newPath === filePath);
            return (file?.hunks ?? []) as DiffHunk[];
          }

          if (review.sourceType === "commits" && review.sourceRef) {
            const shas = review.sourceRef.split(",").map((s) => s.trim());
            const diff = yield* git.getCommitDiff(shas);
            const diffFiles = parseDiff(diff);
            const file = diffFiles.find((f) => f.newPath === filePath);
            return (file?.hunks ?? []) as DiffHunk[];
          }

          const snapshot = yield* parseSnapshotData(review.snapshotData);
          if (snapshot.files) {
            const legacyFile = snapshot.files.find(
              (f) => f.newPath === filePath
            );
            return (legacyFile?.hunks ?? []) as DiffHunk[];
          }

          return [] as DiffHunk[];
        });

      const update = (id: ReviewId, input: UpdateReviewInput) =>
        Effect.gen(function* () {
          const existing = yield* repo.findById(id);
          if (!existing) {
            return yield* new ReviewNotFound({ id });
          }

          const status = input.status ? Option.getOrNull(input.status) : null;
          const review = yield* repo.update(id, status);
          if (!review) {
            return yield* new ReviewNotFound({ id });
          }

          return review;
        });

      const remove = (id: ReviewId) =>
        Effect.gen(function* () {
          const existing = yield* repo.findById(id);
          if (!existing) {
            return yield* new ReviewNotFound({ id });
          }

          yield* fileRepo.deleteByReview(id);
          yield* repo.remove(id);

          return { success: true as const };
        });

      const getStats = () =>
        Effect.gen(function* () {
          const total = yield* repo.countAll();
          const inProgress = yield* repo.countByStatus("in_progress");
          const approved = yield* repo.countByStatus("approved");
          const changesRequested =
            yield* repo.countByStatus("changes_requested");

          return { approved, changesRequested, inProgress, total };
        });

      return ReviewService.of({
        create,
        getById,
        getFileHunks,
        getStats,
        list,
        remove,
        update,
      });
    })
  );
}
