import { randomUUID } from "node:crypto";

import { ServiceMap } from "effect";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { SqliteService, withTransaction } from "../db/database";
import type { ReviewHunk, ReviewHunkId } from "../schemas/diff";
import type { ReviewId } from "../schemas/review";

// ---------------------------------------------------------------------------
// Internal row shape
// ---------------------------------------------------------------------------

interface ReviewHunkRow {
  id: string;
  review_file_id: string;
  hunk_index: number;
  old_start: number;
  old_lines: number;
  new_start: number;
  new_lines: number;
  stable_id: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Row → Domain
// ---------------------------------------------------------------------------

const rowToReviewHunk = (row: ReviewHunkRow): ReviewHunk => ({
  createdAt: row.created_at,
  hunkIndex: row.hunk_index,
  id: row.id as ReviewHunkId,
  newLines: row.new_lines,
  newStart: row.new_start,
  oldLines: row.old_lines,
  oldStart: row.old_start,
  reviewFileId: row.review_file_id,
  stableId: row.stable_id,
});

// ---------------------------------------------------------------------------
// Input type for bulk creation
// ---------------------------------------------------------------------------

export interface CreateReviewHunkInput {
  readonly reviewFileId: string;
  readonly hunkIndex: number;
  readonly oldStart: number;
  readonly oldLines: number;
  readonly newStart: number;
  readonly newLines: number;
  readonly stableId: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ReviewHunkRepo extends ServiceMap.Service<
  ReviewHunkRepo,
  {
    findByReviewFile(
      reviewFileId: string
    ): Effect.Effect<readonly ReviewHunk[]>;
    findByStableId(
      reviewFileId: string,
      stableId: string
    ): Effect.Effect<ReviewHunk | null>;
    createBulk(hunks: readonly CreateReviewHunkInput[]): Effect.Effect<void>;
    deleteByReview(reviewId: ReviewId): Effect.Effect<number>;
  }
>()("@ringi/ReviewHunkRepo") {
  static readonly Default: Layer.Layer<ReviewHunkRepo, never, SqliteService> =
    Layer.effect(
      ReviewHunkRepo,
      Effect.gen(function* () {
        const { db } = yield* SqliteService;

        const stmtFindByReviewFile = db.prepare(
          `SELECT * FROM review_hunks WHERE review_file_id = ? ORDER BY hunk_index`
        );
        const stmtFindByStableId = db.prepare(
          `SELECT * FROM review_hunks WHERE review_file_id = ? AND stable_id = ?`
        );
        const stmtInsert = db.prepare(
          `INSERT INTO review_hunks (id, review_file_id, hunk_index, old_start, old_lines, new_start, new_lines, stable_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        );
        const stmtDeleteByReview = db.prepare(
          `DELETE FROM review_hunks WHERE review_file_id IN (SELECT id FROM review_files WHERE review_id = ?)`
        );

        const findByReviewFile = (
          reviewFileId: string
        ): Effect.Effect<readonly ReviewHunk[]> =>
          Effect.sync(
            () =>
              stmtFindByReviewFile.all(
                reviewFileId
              ) as unknown as ReviewHunkRow[]
          ).pipe(Effect.map((rows) => rows.map(rowToReviewHunk)));

        const findByStableId = (
          reviewFileId: string,
          stableId: string
        ): Effect.Effect<ReviewHunk | null> =>
          Effect.sync(() => {
            const row = stmtFindByStableId.get(
              reviewFileId,
              stableId
            ) as unknown as ReviewHunkRow | undefined;
            return row ? rowToReviewHunk(row) : null;
          });

        const createBulk = (
          hunks: readonly CreateReviewHunkInput[]
        ): Effect.Effect<void> =>
          withTransaction(
            db,
            Effect.sync(() => {
              for (const h of hunks) {
                stmtInsert.run(
                  randomUUID(),
                  h.reviewFileId,
                  h.hunkIndex,
                  h.oldStart,
                  h.oldLines,
                  h.newStart,
                  h.newLines,
                  h.stableId
                );
              }
            })
          );

        const deleteByReview = (reviewId: ReviewId): Effect.Effect<number> =>
          Effect.sync(() => {
            const result = stmtDeleteByReview.run(reviewId);
            return Number(result.changes);
          });

        return ReviewHunkRepo.of({
          createBulk,
          deleteByReview,
          findByReviewFile,
          findByStableId,
        });
      })
    );
}
