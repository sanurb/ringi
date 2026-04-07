import { randomUUID } from "node:crypto";

import { ServiceMap } from "effect";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { SqliteService, withTransaction } from "../db/database";
import type {
  CreateAnnotationInput,
  ReviewAnnotation,
} from "../schemas/annotation";
import type { ReviewId } from "../schemas/review";

// ---------------------------------------------------------------------------
// Internal row shape
// ---------------------------------------------------------------------------

interface AnnotationRow {
  id: string;
  review_id: string;
  source: string;
  file_path: string;
  hunk_stable_id: string | null;
  line_start: number;
  line_end: number;
  side: string;
  type: string;
  severity: string | null;
  reasoning: string | null;
  content: string;
  suggested_code: string | null;
  author: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Row → Domain
// ---------------------------------------------------------------------------

const rowToAnnotation = (row: AnnotationRow): ReviewAnnotation => ({
  author: row.author,
  content: row.content,
  createdAt: row.created_at,
  filePath: row.file_path,
  hunkStableId: row.hunk_stable_id,
  id: row.id,
  lineEnd: row.line_end,
  lineStart: row.line_start,
  reasoning: row.reasoning,
  reviewId: row.review_id as ReviewId,
  severity: row.severity as ReviewAnnotation["severity"],
  side: row.side as ReviewAnnotation["side"],
  source: row.source,
  suggestedCode: row.suggested_code,
  type: row.type as ReviewAnnotation["type"],
});

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AnnotationRepo extends ServiceMap.Service<
  AnnotationRepo,
  {
    add(
      reviewId: ReviewId,
      annotations: readonly CreateAnnotationInput[]
    ): Effect.Effect<readonly ReviewAnnotation[]>;
    removeById(id: string): Effect.Effect<boolean>;
    clearBySource(reviewId: ReviewId, source: string): Effect.Effect<number>;
    findByReview(
      reviewId: ReviewId
    ): Effect.Effect<readonly ReviewAnnotation[]>;
    findByFile(
      reviewId: ReviewId,
      filePath: string
    ): Effect.Effect<readonly ReviewAnnotation[]>;
    countByReview(reviewId: ReviewId): Effect.Effect<number>;
  }
>()("@ringi/AnnotationRepo") {
  static readonly Default: Layer.Layer<AnnotationRepo, never, SqliteService> =
    Layer.effect(
      AnnotationRepo,
      Effect.gen(function* () {
        const { db } = yield* SqliteService;

        const stmtInsert = db.prepare(
          `INSERT INTO review_annotations
           (id, review_id, source, file_path, hunk_stable_id, line_start, line_end, side, type, severity, reasoning, content, suggested_code, author, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        );
        const stmtFindById = db.prepare(
          `SELECT * FROM review_annotations WHERE id = ?`
        );
        const stmtRemoveById = db.prepare(
          `DELETE FROM review_annotations WHERE id = ?`
        );
        const stmtClearBySource = db.prepare(
          `DELETE FROM review_annotations WHERE review_id = ? AND source = ?`
        );
        const stmtFindByReview = db.prepare(
          `SELECT * FROM review_annotations WHERE review_id = ? ORDER BY file_path, line_start`
        );
        const stmtFindByFile = db.prepare(
          `SELECT * FROM review_annotations WHERE review_id = ? AND file_path = ? ORDER BY line_start`
        );
        const stmtCountByReview = db.prepare(
          `SELECT COUNT(*) as count FROM review_annotations WHERE review_id = ?`
        );

        const add = (
          reviewId: ReviewId,
          annotations: readonly CreateAnnotationInput[]
        ): Effect.Effect<readonly ReviewAnnotation[]> =>
          withTransaction(
            db,
            Effect.sync(() => {
              const results: ReviewAnnotation[] = [];
              for (const a of annotations) {
                const id = randomUUID();
                stmtInsert.run(
                  id,
                  reviewId,
                  a.source,
                  a.filePath,
                  a.hunkStableId ?? null,
                  a.lineStart,
                  a.lineEnd,
                  a.side ?? "new",
                  a.type ?? "comment",
                  a.severity ?? null,
                  a.reasoning ?? null,
                  a.content,
                  a.suggestedCode ?? null,
                  a.author ?? null
                );
                const row = stmtFindById.get(id) as unknown as AnnotationRow;
                results.push(rowToAnnotation(row));
              }
              return results;
            })
          );

        const removeById = (id: string): Effect.Effect<boolean> =>
          Effect.sync(() => {
            const result = stmtRemoveById.run(id);
            return Number(result.changes) > 0;
          });

        const clearBySource = (
          reviewId: ReviewId,
          source: string
        ): Effect.Effect<number> =>
          Effect.sync(() => {
            const result = stmtClearBySource.run(reviewId, source);
            return Number(result.changes);
          });

        const findByReview = (
          reviewId: ReviewId
        ): Effect.Effect<readonly ReviewAnnotation[]> =>
          Effect.sync(() =>
            (stmtFindByReview.all(reviewId) as unknown as AnnotationRow[]).map(
              rowToAnnotation
            )
          );

        const findByFile = (
          reviewId: ReviewId,
          filePath: string
        ): Effect.Effect<readonly ReviewAnnotation[]> =>
          Effect.sync(() =>
            (
              stmtFindByFile.all(
                reviewId,
                filePath
              ) as unknown as AnnotationRow[]
            ).map(rowToAnnotation)
          );

        const countByReview = (reviewId: ReviewId): Effect.Effect<number> =>
          Effect.sync(() => {
            const row = stmtCountByReview.get(reviewId) as { count: number };
            return row.count;
          });

        return AnnotationRepo.of({
          add,
          clearBySource,
          countByReview,
          findByFile,
          findByReview,
          removeById,
        });
      })
    );
}
