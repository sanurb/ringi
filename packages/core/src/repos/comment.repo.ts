import { ServiceMap } from "effect";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { SqliteService } from "../db/database";
import type { Comment, CommentId } from "../schemas/comment";
import type { ReviewId } from "../schemas/review";

// ---------------------------------------------------------------------------
// Internal row shape (snake_case from SQLite)
// ---------------------------------------------------------------------------

interface CommentRow {
  id: string;
  review_id: string;
  file_path: string;
  line_number: number | null;
  line_type: string | null;
  content: string;
  suggestion: string | null;
  resolved: number; // SQLite stores booleans as 0/1
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Row → Domain
// ---------------------------------------------------------------------------

const rowToComment = (row: CommentRow): Comment => ({
  content: row.content,
  createdAt: row.created_at,
  filePath: row.file_path,
  id: row.id as CommentId,
  lineNumber: row.line_number,
  lineType: row.line_type as Comment["lineType"],
  resolved: row.resolved === 1,
  reviewId: row.review_id as ReviewId,
  suggestion: row.suggestion,
  updatedAt: row.updated_at,
});

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CommentRepo extends ServiceMap.Service<
  CommentRepo,
  {
    findById(id: CommentId): Effect.Effect<Comment | null>;
    findByReview(reviewId: ReviewId): Effect.Effect<readonly Comment[]>;
    findByFile(
      reviewId: ReviewId,
      filePath: string
    ): Effect.Effect<readonly Comment[]>;
    create(input: {
      id: CommentId;
      reviewId: ReviewId;
      filePath: string;
      lineNumber: number | null;
      lineType: string | null;
      content: string;
      suggestion: string | null;
    }): Effect.Effect<Comment>;
    update(
      id: CommentId,
      updates: { content?: string; suggestion?: string | null }
    ): Effect.Effect<Comment | null>;
    setResolved(
      id: CommentId,
      resolved: boolean
    ): Effect.Effect<Comment | null>;
    remove(id: CommentId): Effect.Effect<boolean>;
    removeByReview(reviewId: ReviewId): Effect.Effect<number>;
    countByReview(reviewId: ReviewId): Effect.Effect<{
      total: number;
      resolved: number;
      unresolved: number;
      withSuggestions: number;
    }>;
  }
>()("@ringi/CommentRepo") {
  static readonly Default: Layer.Layer<CommentRepo, never, SqliteService> =
    Layer.effect(
      CommentRepo,
      Effect.gen(function* () {
        const { db } = yield* SqliteService;

        // Cached prepared statements for static queries
        const stmtFindById = db.prepare("SELECT * FROM comments WHERE id = ?");
        const stmtFindByReview = db.prepare(
          "SELECT * FROM comments WHERE review_id = ? ORDER BY created_at ASC"
        );
        const stmtFindByFile = db.prepare(
          "SELECT * FROM comments WHERE review_id = ? AND file_path = ? ORDER BY line_number ASC, created_at ASC"
        );
        const stmtInsert = db.prepare(
          `INSERT INTO comments (id, review_id, file_path, line_number, line_type, content, suggestion, resolved, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))`
        );
        const stmtDelete = db.prepare("DELETE FROM comments WHERE id = ?");
        const stmtDeleteByReview = db.prepare(
          "DELETE FROM comments WHERE review_id = ?"
        );
        const stmtSetResolved = db.prepare(
          "UPDATE comments SET resolved = ?, updated_at = datetime('now') WHERE id = ?"
        );
        const stmtCountByReview = db.prepare(
          `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN resolved = 1 THEN 1 ELSE 0 END) as resolved,
         SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END) as unresolved,
         SUM(CASE WHEN suggestion IS NOT NULL THEN 1 ELSE 0 END) as with_suggestions
       FROM comments WHERE review_id = ?`
        );

        const findById = (id: CommentId): Effect.Effect<Comment | null> =>
          Effect.sync(() => {
            const row = stmtFindById.get(id) as CommentRow | undefined;
            return row ? rowToComment(row) : null;
          });

        const findByReview = (
          reviewId: ReviewId
        ): Effect.Effect<readonly Comment[]> =>
          Effect.sync(() => {
            const rows = stmtFindByReview.all(
              reviewId
            ) as unknown as CommentRow[];
            return rows.map(rowToComment);
          });

        const findByFile = (
          reviewId: ReviewId,
          filePath: string
        ): Effect.Effect<readonly Comment[]> =>
          Effect.sync(() => {
            const rows = stmtFindByFile.all(
              reviewId,
              filePath
            ) as unknown as CommentRow[];
            return rows.map(rowToComment);
          });

        const create = (input: {
          id: CommentId;
          reviewId: ReviewId;
          filePath: string;
          lineNumber: number | null;
          lineType: string | null;
          content: string;
          suggestion: string | null;
        }): Effect.Effect<Comment> =>
          Effect.sync(() => {
            stmtInsert.run(
              input.id,
              input.reviewId,
              input.filePath,
              input.lineNumber,
              input.lineType,
              input.content,
              input.suggestion
            );
            return rowToComment(
              stmtFindById.get(input.id) as unknown as CommentRow
            );
          });

        const update = (
          id: CommentId,
          updates: { content?: string; suggestion?: string | null }
        ): Effect.Effect<Comment | null> =>
          Effect.sync(() => {
            const setClauses: string[] = [];
            const params: unknown[] = [];

            if (updates.content !== undefined) {
              setClauses.push("content = ?");
              params.push(updates.content);
            }
            if (updates.suggestion !== undefined) {
              setClauses.push("suggestion = ?");
              params.push(updates.suggestion);
            }

            if (setClauses.length === 0) {
              const row = stmtFindById.get(id) as CommentRow | undefined;
              return row ? rowToComment(row) : null;
            }

            setClauses.push("updated_at = datetime('now')");
            params.push(id);

            db.prepare(
              `UPDATE comments SET ${setClauses.join(", ")} WHERE id = ?`
            ).run(...(params as import("node:sqlite").SQLInputValue[]));

            const row = stmtFindById.get(id) as CommentRow | undefined;
            return row ? rowToComment(row) : null;
          });

        const setResolved = (
          id: CommentId,
          resolved: boolean
        ): Effect.Effect<Comment | null> =>
          Effect.sync(() => {
            stmtSetResolved.run(resolved ? 1 : 0, id);
            const row = stmtFindById.get(id) as CommentRow | undefined;
            return row ? rowToComment(row) : null;
          });

        const remove = (id: CommentId): Effect.Effect<boolean> =>
          Effect.sync(() => {
            const result = stmtDelete.run(id);
            return Number(result.changes) > 0;
          });

        const removeByReview = (reviewId: ReviewId): Effect.Effect<number> =>
          Effect.sync(() => {
            const result = stmtDeleteByReview.run(reviewId);
            return Number(result.changes);
          });

        const countByReview = (
          reviewId: ReviewId
        ): Effect.Effect<{
          total: number;
          resolved: number;
          unresolved: number;
          withSuggestions: number;
        }> =>
          Effect.sync(() => {
            const row = stmtCountByReview.get(reviewId) as unknown as {
              total: number;
              resolved: number;
              unresolved: number;
              with_suggestions: number;
            };
            return {
              resolved: row.resolved,
              total: row.total,
              unresolved: row.unresolved,
              withSuggestions: row.with_suggestions,
            };
          });

        return CommentRepo.of({
          countByReview,
          create,
          findByFile,
          findById,
          findByReview,
          remove,
          removeByReview,
          setResolved,
          update,
        });
      })
    );
}
