import { ServiceMap } from "effect";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { SqliteService, withTransaction } from "../db/database";
import type { Todo, TodoId } from "../schemas/todo";

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
  completed: row.completed === 1,
  content: row.content,
  createdAt: row.created_at,
  id: row.id as TodoId,
  position: row.position,
  reviewId: row.review_id as Todo["reviewId"],
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

export class TodoRepo extends ServiceMap.Service<
  TodoRepo,
  {
    findById(id: TodoId): Effect.Effect<Todo | null>;
    findAll(
      opts?: FindAllOpts
    ): Effect.Effect<{ data: readonly Todo[]; total: number }>;
    create(input: {
      id: TodoId;
      content: string;
      reviewId: string | null;
    }): Effect.Effect<Todo>;
    update(
      id: TodoId,
      updates: { content?: string; completed?: boolean }
    ): Effect.Effect<Todo | null>;
    toggle(id: TodoId): Effect.Effect<Todo | null>;
    remove(id: TodoId): Effect.Effect<boolean>;
    removeCompleted(): Effect.Effect<number>;
    reorder(orderedIds: readonly string[]): Effect.Effect<number>;
    move(id: TodoId, newPosition: number): Effect.Effect<Todo | null>;
    countAll(): Effect.Effect<number>;
    countCompleted(): Effect.Effect<number>;
    countPending(): Effect.Effect<number>;
  }
>()("@ringi/TodoRepo") {
  static readonly Default: Layer.Layer<TodoRepo, never, SqliteService> =
    Layer.effect(
      TodoRepo,
      Effect.gen(function* () {
        const { db } = yield* SqliteService;

        // Cached prepared statements for static queries
        const stmtFindById = db.prepare("SELECT * FROM todos WHERE id = ?");
        const stmtInsert = db.prepare(
          `INSERT INTO todos (id, content, completed, review_id, position, created_at, updated_at)
       VALUES (?, ?, 0, ?, ?, datetime('now'), datetime('now'))`
        );
        const stmtDelete = db.prepare("DELETE FROM todos WHERE id = ?");
        const stmtDeleteCompleted = db.prepare(
          "DELETE FROM todos WHERE completed = 1"
        );
        const stmtNextPosition = db.prepare(
          "SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM todos"
        );
        const stmtCountAll = db.prepare("SELECT COUNT(*) as count FROM todos");
        const stmtCountCompleted = db.prepare(
          "SELECT COUNT(*) as count FROM todos WHERE completed = 1"
        );
        const stmtCountPending = db.prepare(
          "SELECT COUNT(*) as count FROM todos WHERE completed = 0"
        );

        const findById = (id: TodoId): Effect.Effect<Todo | null> =>
          Effect.sync(() => {
            const row = stmtFindById.get(id) as TodoRow | undefined;
            return row ? rowToTodo(row) : null;
          });

        const findAll = (
          opts: FindAllOpts = {}
        ): Effect.Effect<{ data: readonly Todo[]; total: number }> =>
          Effect.sync(() => {
            const conditions: string[] = [];
            const params: unknown[] = [];

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
              .get(
                ...(params as import("node:sqlite").SQLInputValue[])
              ) as unknown as { count: number };

            const limitClause = opts.limit != null ? ` LIMIT ? OFFSET ?` : "";
            const queryParams =
              opts.limit != null
                ? [...params, opts.limit, opts.offset ?? 0]
                : params;

            const rows = db
              .prepare(
                `SELECT * FROM todos${where} ORDER BY position ASC${limitClause}`
              )
              .all(
                ...(queryParams as import("node:sqlite").SQLInputValue[])
              ) as unknown as TodoRow[];

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
          updates: { content?: string; completed?: boolean }
        ): Effect.Effect<Todo | null> =>
          Effect.sync(() => {
            const sets: string[] = [];
            const params: unknown[] = [];

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

            db.prepare(`UPDATE todos SET ${sets.join(", ")} WHERE id = ?`).run(
              ...(params as import("node:sqlite").SQLInputValue[])
            );

            const row = stmtFindById.get(id) as TodoRow | undefined;
            return row ? rowToTodo(row) : null;
          });

        const toggle = (id: TodoId): Effect.Effect<Todo | null> =>
          Effect.sync(() => {
            const row = stmtFindById.get(id) as TodoRow | undefined;
            if (!row) {
              return null;
            }

            const newCompleted = row.completed === 1 ? 0 : 1;
            db.prepare(
              "UPDATE todos SET completed = ?, updated_at = datetime('now') WHERE id = ?"
            ).run(newCompleted, id);

            return rowToTodo(stmtFindById.get(id) as unknown as TodoRow);
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
          orderedIds: readonly string[]
        ): Effect.Effect<number> =>
          withTransaction(
            db,
            Effect.sync(() => {
              const stmt = db.prepare(
                "UPDATE todos SET position = ?, updated_at = datetime('now') WHERE id = ?"
              );
              let updated = 0;
              for (let i = 0; i < orderedIds.length; i++) {
                const result = stmt.run(i, orderedIds[i]!);
                updated += Number(result.changes);
              }
              return updated;
            })
          );

        const move = (
          id: TodoId,
          newPosition: number
        ): Effect.Effect<Todo | null> =>
          Effect.gen(function* () {
            const row = stmtFindById.get(id) as TodoRow | undefined;
            if (!row) {
              return null;
            }

            const oldPosition = row.position;

            yield* withTransaction(
              db,
              Effect.sync(() => {
                if (newPosition < oldPosition) {
                  db.prepare(
                    "UPDATE todos SET position = position + 1, updated_at = datetime('now') WHERE position >= ? AND position < ? AND id != ?"
                  ).run(newPosition, oldPosition, id);
                } else if (newPosition > oldPosition) {
                  db.prepare(
                    "UPDATE todos SET position = position - 1, updated_at = datetime('now') WHERE position > ? AND position <= ? AND id != ?"
                  ).run(oldPosition, newPosition, id);
                }

                db.prepare(
                  "UPDATE todos SET position = ?, updated_at = datetime('now') WHERE id = ?"
                ).run(newPosition, id);
              })
            );

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

        return TodoRepo.of({
          countAll,
          countCompleted,
          countPending,
          create,
          findAll,
          findById,
          move,
          remove,
          removeCompleted,
          reorder,
          toggle,
          update,
        });
      })
    );
}
