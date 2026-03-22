import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";

import { runMigrations } from "./migrations";

/**
 * Wraps `body` in a SQLite transaction: BEGIN before, COMMIT on success,
 * ROLLBACK on any failure or interruption.
 */
export const withTransaction = <A, E, R>(
  db: DatabaseSync,
  body: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> =>
  Effect.acquireUseRelease(
    Effect.sync(() => db.exec("BEGIN")),
    () => body,
    (_, exit) =>
      Effect.sync(() => {
        if (Exit.isSuccess(exit)) {
          db.exec("COMMIT");
        } else {
          db.exec("ROLLBACK");
        }
      })
  );

export class SqliteService extends Effect.Service<SqliteService>()(
  "@ringi/SqliteService",
  {
    effect: Effect.gen(function* effect() {
      const dbPath = yield* Config.string("DB_PATH").pipe(
        Config.withDefault(".ringi/reviews.db")
      );

      mkdirSync(dirname(dbPath), { recursive: true });

      const db = new DatabaseSync(dbPath);
      db.exec("PRAGMA journal_mode=WAL");
      db.exec("PRAGMA foreign_keys=ON");

      runMigrations(db);

      return { db } as const;
    }),
  }
) {}
