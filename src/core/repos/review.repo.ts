import * as Effect from "effect/Effect";

import type { Review, ReviewId } from "@/api/schemas/review";
import { SqliteService } from "@/core/db/database";

// ---------------------------------------------------------------------------
// Internal row shape (snake_case from SQLite)
// ---------------------------------------------------------------------------

interface ReviewRow {
  id: string;
  repository_path: string;
  base_ref: string | null;
  source_type: string;
  source_ref: string | null;
  snapshot_data: string;
  status: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Row → Domain
// ---------------------------------------------------------------------------

const rowToReview = (row: ReviewRow): Review => ({
  baseRef: row.base_ref,
  createdAt: row.created_at,
  id: row.id as ReviewId,
  repositoryPath: row.repository_path,
  snapshotData: row.snapshot_data,
  sourceRef: row.source_ref,
  sourceType: row.source_type as Review["sourceType"],
  status: row.status as Review["status"],
  updatedAt: row.updated_at,
});

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

interface FindAllOpts {
  readonly status?: string;
  readonly repositoryPath?: string;
  readonly sourceType?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export class ReviewRepo extends Effect.Service<ReviewRepo>()(
  "@ringi/ReviewRepo",
  {
    dependencies: [SqliteService.Default],
    effect: Effect.gen(function* effect() {
      const { db } = yield* SqliteService;

      // Cached prepared statements for static queries
      const stmtFindById = db.prepare("SELECT * FROM reviews WHERE id = ?");
      const stmtInsert = db.prepare(
        `INSERT INTO reviews (id, repository_path, base_ref, source_type, source_ref, snapshot_data, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      );
      const stmtUpdate = db.prepare(
        `UPDATE reviews SET status = COALESCE(?, status), updated_at = datetime('now') WHERE id = ?`
      );
      const stmtDelete = db.prepare("DELETE FROM reviews WHERE id = ?");
      const stmtCountAll = db.prepare("SELECT COUNT(*) as count FROM reviews");
      const stmtCountByStatus = db.prepare(
        "SELECT COUNT(*) as count FROM reviews WHERE status = ?"
      );

      // ------------------------------------------------------------------

      const findById = (id: ReviewId): Effect.Effect<Review | null> =>
        Effect.sync(() => {
          const row = stmtFindById.get(id) as ReviewRow | undefined;
          return row ? rowToReview(row) : null;
        });

      const findAll = (
        opts: FindAllOpts = {}
      ): Effect.Effect<{ data: readonly Review[]; total: number }> =>
        Effect.sync(() => {
          const conditions: string[] = [];
          const params: unknown[] = [];

          if (opts.status != null) {
            conditions.push("status = ?");
            params.push(opts.status);
          }
          if (opts.repositoryPath != null) {
            conditions.push("repository_path = ?");
            params.push(opts.repositoryPath);
          }
          if (opts.sourceType != null) {
            conditions.push("source_type = ?");
            params.push(opts.sourceType);
          }

          const where =
            conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";

          const page = opts.page ?? 1;
          const pageSize = opts.pageSize ?? 20;
          const offset = (page - 1) * pageSize;

          const totalRow = db
            .prepare(`SELECT COUNT(*) as count FROM reviews${where}`)
            .get(
              ...(params as import("node:sqlite").SQLInputValue[])
            ) as unknown as { count: number };

          const rows = db
            .prepare(
              `SELECT * FROM reviews${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
            )
            .all(
              ...(params as import("node:sqlite").SQLInputValue[]),
              pageSize,
              offset
            ) as unknown as ReviewRow[];

          return { data: rows.map(rowToReview), total: totalRow.count };
        });

      const create = (input: {
        id: ReviewId;
        repositoryPath: string;
        baseRef: string | null;
        sourceType: string;
        sourceRef: string | null;
        snapshotData: string;
        status: string;
      }): Effect.Effect<Review> =>
        Effect.sync(() => {
          stmtInsert.run(
            input.id,
            input.repositoryPath,
            input.baseRef,
            input.sourceType,
            input.sourceRef,
            input.snapshotData,
            input.status
          );
          // Row guaranteed to exist after successful insert
          return rowToReview(
            stmtFindById.get(input.id) as unknown as ReviewRow
          );
        });

      const update = (
        id: ReviewId,
        status: string | null
      ): Effect.Effect<Review | null> =>
        Effect.sync(() => {
          stmtUpdate.run(status, id);
          const row = stmtFindById.get(id) as ReviewRow | undefined;
          return row ? rowToReview(row) : null;
        });

      const remove = (id: ReviewId): Effect.Effect<boolean> =>
        Effect.sync(() => {
          const result = stmtDelete.run(id);
          return Number(result.changes) > 0;
        });

      const countAll = (): Effect.Effect<number> =>
        Effect.sync(() => {
          const row = stmtCountAll.get() as { count: number };
          return row.count;
        });

      const countByStatus = (status: string): Effect.Effect<number> =>
        Effect.sync(() => {
          const row = stmtCountByStatus.get(status) as { count: number };
          return row.count;
        });

      return {
        countAll,
        countByStatus,
        create,
        findAll,
        findById,
        remove,
        update,
      } as const;
    }),
  }
) {}
