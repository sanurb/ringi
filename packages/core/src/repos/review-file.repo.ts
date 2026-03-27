import { randomUUID } from "node:crypto";

import { ServiceMap } from "effect";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { SqliteService, withTransaction } from "../db/database";
import type { DiffHunk } from "../schemas/diff";
import type { ReviewId } from "../schemas/review";

// ---------------------------------------------------------------------------
// Internal row shapes
// ---------------------------------------------------------------------------

interface ReviewFileRow {
  id: string;
  review_id: string;
  file_path: string;
  old_path: string | null;
  status: string;
  additions: number;
  deletions: number;
  hunks_data: string | null;
  created_at: string;
}

interface ReviewFileMetadataRow {
  id: string;
  review_id: string;
  file_path: string;
  old_path: string | null;
  status: string;
  additions: number;
  deletions: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Input type for bulk creation
// ---------------------------------------------------------------------------

export interface CreateReviewFileInput {
  readonly reviewId: ReviewId;
  readonly filePath: string;
  readonly oldPath: string | null;
  readonly status: string;
  readonly additions: number;
  readonly deletions: number;
  readonly hunksData: string | null;
}

// ---------------------------------------------------------------------------
// Static helpers
// ---------------------------------------------------------------------------

export const parseHunks = (
  hunksData: string | null
): Effect.Effect<readonly DiffHunk[]> =>
  hunksData == null
    ? Effect.succeed([])
    : Effect.try({
        try: () => JSON.parse(hunksData) as readonly DiffHunk[],
        catch: () => [] as readonly DiffHunk[],
      }).pipe(Effect.orElseSucceed(() => [] as readonly DiffHunk[]));

export const serializeHunks = (hunks: readonly DiffHunk[]): string =>
  JSON.stringify(hunks);

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ReviewFileRepo extends ServiceMap.Service<
  ReviewFileRepo,
  {
    findByReview(
      reviewId: ReviewId
    ): Effect.Effect<readonly ReviewFileMetadataRow[]>;
    findByReviewAndPath(
      reviewId: ReviewId,
      filePath: string
    ): Effect.Effect<ReviewFileRow | null>;
    createBulk(files: readonly CreateReviewFileInput[]): Effect.Effect<void>;
    deleteByReview(reviewId: ReviewId): Effect.Effect<number>;
    countByReview(reviewId: ReviewId): Effect.Effect<number>;
  }
>()("@ringi/ReviewFileRepo") {
  static readonly Default: Layer.Layer<ReviewFileRepo, never, SqliteService> =
    Layer.effect(
      ReviewFileRepo,
      Effect.gen(function* () {
        const { db } = yield* SqliteService;

        // Cached prepared statements
        const stmtFindByReview = db.prepare(
          `SELECT id, review_id, file_path, old_path, status, additions, deletions, created_at
         FROM review_files WHERE review_id = ? ORDER BY file_path`
        );
        const stmtFindByReviewAndPath = db.prepare(
          "SELECT * FROM review_files WHERE review_id = ? AND file_path = ?"
        );
        const stmtInsert = db.prepare(
          `INSERT INTO review_files (id, review_id, file_path, old_path, status, additions, deletions, hunks_data, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        );
        const stmtDeleteByReview = db.prepare(
          "DELETE FROM review_files WHERE review_id = ?"
        );
        const stmtCountByReview = db.prepare(
          "SELECT COUNT(*) as count FROM review_files WHERE review_id = ?"
        );

        const findByReview = (
          reviewId: ReviewId
        ): Effect.Effect<readonly ReviewFileMetadataRow[]> =>
          Effect.sync(
            () =>
              stmtFindByReview.all(
                reviewId
              ) as unknown as ReviewFileMetadataRow[]
          );

        const findByReviewAndPath = (
          reviewId: ReviewId,
          filePath: string
        ): Effect.Effect<ReviewFileRow | null> =>
          Effect.sync(() => {
            const row = stmtFindByReviewAndPath.get(
              reviewId,
              filePath
            ) as unknown as ReviewFileRow | undefined;
            return row ?? null;
          });

        const createBulk = (
          files: readonly CreateReviewFileInput[]
        ): Effect.Effect<void> =>
          withTransaction(
            db,
            Effect.sync(() => {
              for (const f of files) {
                stmtInsert.run(
                  randomUUID(),
                  f.reviewId,
                  f.filePath,
                  f.oldPath,
                  f.status,
                  f.additions,
                  f.deletions,
                  f.hunksData
                );
              }
            })
          );

        const deleteByReview = (reviewId: ReviewId): Effect.Effect<number> =>
          Effect.sync(() => {
            const result = stmtDeleteByReview.run(reviewId);
            return Number(result.changes);
          });

        const countByReview = (reviewId: ReviewId): Effect.Effect<number> =>
          Effect.sync(() => {
            const row = stmtCountByReview.get(reviewId) as { count: number };
            return row.count;
          });

        return ReviewFileRepo.of({
          countByReview,
          createBulk,
          deleteByReview,
          findByReview,
          findByReviewAndPath,
        });
      })
    );
}
