import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

import { runMigrations } from "./migrations";

export class SqliteService extends Effect.Service<SqliteService>()(
  "SqliteService",
  {
    effect: Effect.gen(function* () {
      const dbPath = yield* Config.string("DB_PATH").pipe(
        Config.withDefault(".ringi/reviews.db"),
      );

      mkdirSync(dirname(dbPath), { recursive: true });

      const db = new DatabaseSync(dbPath);
      db.exec("PRAGMA journal_mode=WAL");
      db.exec("PRAGMA foreign_keys=ON");

      runMigrations(db);

      return { db } as const;
    }),
  },
) {}
