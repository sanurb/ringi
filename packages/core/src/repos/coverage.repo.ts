import { randomUUID } from "node:crypto";

import { ServiceMap } from "effect";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { SqliteService } from "../db/database";
import type { ReviewId } from "../schemas/review";

// ---------------------------------------------------------------------------
// Internal row shape
// ---------------------------------------------------------------------------

interface CoverageRow {
  id: string;
  review_id: string;
  hunk_stable_id: string;
  start_line: number | null;
  end_line: number | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CoverageRepo extends ServiceMap.Service<
  CoverageRepo,
  {
    markRange(
      reviewId: ReviewId,
      hunkStableId: string,
      startLine: number | null,
      endLine: number | null
    ): Effect.Effect<void>;
    unmark(reviewId: ReviewId, hunkStableId: string): Effect.Effect<void>;
    findByReview(reviewId: ReviewId): Effect.Effect<readonly CoverageRow[]>;
    findByHunk(
      reviewId: ReviewId,
      hunkStableId: string
    ): Effect.Effect<readonly CoverageRow[]>;
    deleteByReview(reviewId: ReviewId): Effect.Effect<number>;
  }
>()("@ringi/CoverageRepo") {
  static readonly Default: Layer.Layer<CoverageRepo, never, SqliteService> =
    Layer.effect(
      CoverageRepo,
      Effect.gen(function* () {
        const { db } = yield* SqliteService;

        const stmtInsert = db.prepare(
          `INSERT INTO review_coverage (id, review_id, hunk_stable_id, start_line, end_line, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`
        );
        const stmtDeleteHunk = db.prepare(
          `DELETE FROM review_coverage WHERE review_id = ? AND hunk_stable_id = ?`
        );
        const stmtFindByReview = db.prepare(
          `SELECT * FROM review_coverage WHERE review_id = ? ORDER BY hunk_stable_id, start_line`
        );
        const stmtFindByHunk = db.prepare(
          `SELECT * FROM review_coverage WHERE review_id = ? AND hunk_stable_id = ? ORDER BY start_line`
        );
        const stmtDeleteByReview = db.prepare(
          `DELETE FROM review_coverage WHERE review_id = ?`
        );

        const markRange = (
          reviewId: ReviewId,
          hunkStableId: string,
          startLine: number | null,
          endLine: number | null
        ): Effect.Effect<void> =>
          Effect.sync(() => {
            stmtInsert.run(
              randomUUID(),
              reviewId,
              hunkStableId,
              startLine,
              endLine
            );
          });

        const unmark = (
          reviewId: ReviewId,
          hunkStableId: string
        ): Effect.Effect<void> =>
          Effect.sync(() => {
            stmtDeleteHunk.run(reviewId, hunkStableId);
          });

        const findByReview = (
          reviewId: ReviewId
        ): Effect.Effect<readonly CoverageRow[]> =>
          Effect.sync(
            () => stmtFindByReview.all(reviewId) as unknown as CoverageRow[]
          );

        const findByHunk = (
          reviewId: ReviewId,
          hunkStableId: string
        ): Effect.Effect<readonly CoverageRow[]> =>
          Effect.sync(
            () =>
              stmtFindByHunk.all(
                reviewId,
                hunkStableId
              ) as unknown as CoverageRow[]
          );

        const deleteByReview = (reviewId: ReviewId): Effect.Effect<number> =>
          Effect.sync(() => {
            const result = stmtDeleteByReview.run(reviewId);
            return Number(result.changes);
          });

        return CoverageRepo.of({
          deleteByReview,
          findByHunk,
          findByReview,
          markRange,
          unmark,
        });
      })
    );
}
