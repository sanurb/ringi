import type { DatabaseSync } from "node:sqlite";

const migrations: readonly string[] = [
  // v1: reviews table
  `CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    repository_path TEXT NOT NULL,
    base_ref TEXT,
    snapshot_data TEXT NOT NULL,
    status TEXT DEFAULT 'in_progress',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  ) STRICT`,

  // v2: comments table
  `CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    line_number INTEGER,
    line_type TEXT,
    content TEXT NOT NULL,
    suggestion TEXT,
    resolved INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  ) STRICT`,

  // v3: add source_type and source_ref to reviews
  `ALTER TABLE reviews ADD COLUMN source_type TEXT DEFAULT 'staged';
   ALTER TABLE reviews ADD COLUMN source_ref TEXT`,

  // v4: todos table
  `CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    completed INTEGER DEFAULT 0,
    review_id TEXT REFERENCES reviews(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  ) STRICT`,

  // v5: add position to todos
  `ALTER TABLE todos ADD COLUMN position INTEGER DEFAULT 0`,

  // v6: review_files table
  `CREATE TABLE IF NOT EXISTS review_files (
    id TEXT PRIMARY KEY,
    review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    old_path TEXT,
    status TEXT NOT NULL,
    additions INTEGER NOT NULL DEFAULT 0,
    deletions INTEGER NOT NULL DEFAULT 0,
    hunks_data TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  ) STRICT`,
];

/** Apply pending migrations using PRAGMA user_version as the version tracker. */
export const runMigrations = (db: DatabaseSync): void => {
  const currentVersion = (
    db.prepare("PRAGMA user_version").get() as { user_version: number }
  ).user_version;

  for (let i = currentVersion; i < migrations.length; i++) {
    // v3 (and any future multi-statement migration) uses semicolons to
    // separate statements — split and execute each independently.
    const statements = migrations[i]!.split(";")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const sql of statements) {
      db.exec(sql);
    }

    db.exec(`PRAGMA user_version = ${i + 1}`);
  }
};
