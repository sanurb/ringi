import * as Effect from "effect/Effect";

import type { Todo, TodoId } from "@/api/schemas/todo";

import { SqliteService } from "../db/database";

// ---------------------------------------------------------------------------
// Internal row shape (snake_case from SQLite)
// ---------------------------------------------------------------------------

interface TodoRow {
  id: string;
  content: string;
  completed: number;
  review_id: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Row → Domain
// ---------------------------------------------------------------------------

const rowToTodo = (row: TodoRow): Todo => ({
  id: row.id as TodoId,
  content: row.content,
  completed: row.completed === 1,
  reviewId: row.review_id as Todo["reviewId"],
  position: row.position,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

interface FindAllOpts {
  readonly reviewId?: string;
  readonly completed?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

export class TodoRepo extends Effect.Service<TodoRepo>()("TodoRepo", {
  dependencies: [SqliteService.Default],
  effect: Effect.gen(function* () {
    const { db } = yield* SqliteService;

    // Cached prepared statements for static queries
    const stmtFindById = db.prepare("SELECT * FROM todos WHERE id = ?");
    const stmtInsert = db.prepare(
      `INSERT INTO todos (id, content, completed, review_id, position, created_at, updated_at)
       VALUES (?, ?, 0, ?, ?, datetime('now'), datetime('now'))`,
    );
    const stmtDelete = db.prepare("DELETE FROM todos WHERE id = ?");
    const stmtDeleteCompleted = db.prepare(
      "DELETE FROM todos WHERE completed = 1",
    );
    const stmtNextPosition = db.prepare(
      "SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM todos",
    );
    const stmtCountAll = db.prepare(
      "SELECT COUNT(*) as count FROM todos",
    );
    const stmtCountCompleted = db.prepare(
      "SELECT COUNT(*) as count FROM todos WHERE completed = 1",
    );
    const stmtCountPending = db.prepare(
      "SELECT COUNT(*) as count FROM todos WHERE completed = 0",
    );

    // ------------------------------------------------------------------

    const findById = (id: TodoId): Effect.Effect<Todo | null> =>
      Effect.sync(() => {
        const row = stmtFindById.get(id) as TodoRow | undefined;
        return row ? rowToTodo(row) : null;
      });

    const findAll = (
      opts: FindAllOpts = {},
    ): Effect.Effect<{ data: ReadonlyArray<Todo>; total: number }> =>
      Effect.sync(() => {
        const conditions: Array<string> = [];
        const params: Array<unknown> = [];

        if (opts.reviewId != null) {
          conditions.push("review_id = ?");
          params.push(opts.reviewId);
        }
        if (opts.completed != null) {
          conditions.push("completed = ?");
          params.push(opts.completed ? 1 : 0);
        }

        const where =
          conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";

        const totalRow = db
          .prepare(`SELECT COUNT(*) as count FROM todos${where}`)
          .get(...(params as Array<import("node:sqlite").SQLInputValue>)) as unknown as { count: number };

        const limitClause =
          opts.limit != null ? ` LIMIT ? OFFSET ?` : "";
        const queryParams =
          opts.limit != null
            ? [...params, opts.limit, opts.offset ?? 0]
            : params;

        const rows = db
          .prepare(
            `SELECT * FROM todos${where} ORDER BY position ASC${limitClause}`,
          )
          .all(...(queryParams as Array<import("node:sqlite").SQLInputValue>)) as unknown as Array<TodoRow>;

        return { data: rows.map(rowToTodo), total: totalRow.count };
      });

    const create = (input: {
      id: TodoId;
      content: string;
      reviewId: string | null;
    }): Effect.Effect<Todo> =>
      Effect.sync(() => {
        const { next_pos } = stmtNextPosition.get() as unknown as {
          next_pos: number;
        };
        stmtInsert.run(input.id, input.content, input.reviewId, next_pos);
        return rowToTodo(stmtFindById.get(input.id) as unknown as TodoRow);
      });

    const update = (
      id: TodoId,
      updates: { content?: string; completed?: boolean },
    ): Effect.Effect<Todo | null> =>
      Effect.sync(() => {
        const sets: Array<string> = [];
        const params: Array<unknown> = [];

        if (updates.content != null) {
          sets.push("content = ?");
          params.push(updates.content);
        }
        if (updates.completed != null) {
          sets.push("completed = ?");
          params.push(updates.completed ? 1 : 0);
        }

        if (sets.length === 0) {
          const row = stmtFindById.get(id) as TodoRow | undefined;
          return row ? rowToTodo(row) : null;
        }

        sets.push("updated_at = datetime('now')");
        params.push(id);

        db.prepare(
          `UPDATE todos SET ${sets.join(", ")} WHERE id = ?`,
        ).run(...(params as Array<import("node:sqlite").SQLInputValue>));

        const row = stmtFindById.get(id) as TodoRow | undefined;
        return row ? rowToTodo(row) : null;
      });

    const toggle = (id: TodoId): Effect.Effect<Todo | null> =>
      Effect.sync(() => {
        const row = stmtFindById.get(id) as TodoRow | undefined;
        if (!row) return null;

        const newCompleted = row.completed === 1 ? 0 : 1;
        db.prepare(
          "UPDATE todos SET completed = ?, updated_at = datetime('now') WHERE id = ?",
        ).run(newCompleted, id);

        return rowToTodo(
          stmtFindById.get(id) as unknown as TodoRow,
        );
      });

    const remove = (id: TodoId): Effect.Effect<boolean> =>
      Effect.sync(() => {
        const result = stmtDelete.run(id);
        return Number(result.changes) > 0;
      });

    const removeCompleted = (): Effect.Effect<number> =>
      Effect.sync(() => {
        const result = stmtDeleteCompleted.run();
        return Number(result.changes);
      });

    const reorder = (
      orderedIds: ReadonlyArray<string>,
    ): Effect.Effect<number> =>
      Effect.sync(() => {
        db.exec("BEGIN");
        try {
          const stmt = db.prepare(
            "UPDATE todos SET position = ?, updated_at = datetime('now') WHERE id = ?",
          );
          let updated = 0;
          for (let i = 0; i < orderedIds.length; i++) {
            const result = stmt.run(i, orderedIds[i]!);
            updated += Number(result.changes);
          }
          db.exec("COMMIT");
          return updated;
        } catch (err) {
          db.exec("ROLLBACK");
          throw err;
        }
      });

    const move = (
      id: TodoId,
      newPosition: number,
    ): Effect.Effect<Todo | null> =>
      Effect.sync(() => {
        const row = stmtFindById.get(id) as TodoRow | undefined;
        if (!row) return null;

        const oldPosition = row.position;

        db.exec("BEGIN");
        try {
          if (newPosition < oldPosition) {
            // Moving up: shift items in [newPosition, oldPosition) down by 1
            db.prepare(
              "UPDATE todos SET position = position + 1, updated_at = datetime('now') WHERE position >= ? AND position < ? AND id != ?",
            ).run(newPosition, oldPosition, id);
          } else if (newPosition > oldPosition) {
            // Moving down: shift items in (oldPosition, newPosition] up by 1
            db.prepare(
              "UPDATE todos SET position = position - 1, updated_at = datetime('now') WHERE position > ? AND position <= ? AND id != ?",
            ).run(oldPosition, newPosition, id);
          }

          db.prepare(
            "UPDATE todos SET position = ?, updated_at = datetime('now') WHERE id = ?",
          ).run(newPosition, id);

          db.exec("COMMIT");
        } catch (err) {
          db.exec("ROLLBACK");
          throw err;
        }

        return rowToTodo(stmtFindById.get(id) as unknown as TodoRow);
      });

    const countAll = (): Effect.Effect<number> =>
      Effect.sync(() => {
        const row = stmtCountAll.get() as { count: number };
        return row.count;
      });

    const countCompleted = (): Effect.Effect<number> =>
      Effect.sync(() => {
        const row = stmtCountCompleted.get() as { count: number };
        return row.count;
      });

    const countPending = (): Effect.Effect<number> =>
      Effect.sync(() => {
        const row = stmtCountPending.get() as { count: number };
        return row.count;
      });

    return {
      findById,
      findAll,
      create,
      update,
      toggle,
      remove,
      removeCompleted,
      reorder,
      move,
      countAll,
      countCompleted,
      countPending,
    } as const;
  }),
}) {}
