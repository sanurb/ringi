import { DatabaseSync } from "node:sqlite";

import { SqliteService } from "@ringi/core/db/database";
import { runMigrations } from "@ringi/core/db/migrations";
import { AnnotationRepo } from "@ringi/core/repos/annotation.repo";
import type { CreateAnnotationInput } from "@ringi/core/schemas/annotation";
import type { ReviewId } from "@ringi/core/schemas/review";
import { AnnotationService } from "@ringi/core/services/annotation.service";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

let db: DatabaseSync;
type Deps = AnnotationRepo | AnnotationService;
let runEffect: <A, E>(effect: Effect.Effect<A, E, Deps>) => A;

const REVIEW_ID = "rev-1" as ReviewId;

// We need the review_annotations table. Since migration v9 will create it,
// we need to add it here for testing. We run all migrations (including v9
// once it exists), but for now we create the table manually for schema tests.
const createAnnotationsTable = (database: DatabaseSync) => {
  database.exec(`CREATE TABLE IF NOT EXISTS review_annotations (
    id TEXT PRIMARY KEY,
    review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    file_path TEXT NOT NULL,
    hunk_stable_id TEXT,
    line_start INTEGER NOT NULL,
    line_end INTEGER NOT NULL,
    side TEXT DEFAULT 'new',
    type TEXT DEFAULT 'comment',
    severity TEXT,
    reasoning TEXT,
    content TEXT NOT NULL,
    suggested_code TEXT,
    author TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  ) STRICT`);
  database.exec(
    `CREATE INDEX IF NOT EXISTS idx_annotations_review ON review_annotations(review_id)`
  );
  database.exec(
    `CREATE INDEX IF NOT EXISTS idx_annotations_source ON review_annotations(review_id, source)`
  );
};

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA foreign_keys=ON");
  runMigrations(db);
  createAnnotationsTable(db);

  // Seed review
  db.exec(
    `INSERT INTO reviews (id, repository_path, snapshot_data, status, source_type)
     VALUES ('rev-1', '/tmp/repo', '{}', 'in_progress', 'staged')`
  );

  const testSqlite = Layer.succeed(SqliteService, SqliteService.of({ db }));
  const repoLayer = AnnotationRepo.Default.pipe(Layer.provide(testSqlite));
  const serviceLayer = AnnotationService.Default.pipe(Layer.provide(repoLayer));
  const testLayer = Layer.mergeAll(repoLayer, serviceLayer);

  runEffect = <A, E>(effect: Effect.Effect<A, E, Deps>) =>
    Effect.runSync(Effect.provide(effect, testLayer));
});

afterEach(() => {
  db.close();
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const makeInput = (
  overrides: Partial<CreateAnnotationInput> = {}
): CreateAnnotationInput => ({
  content: "Missing null check",
  filePath: "src/auth.ts",
  lineEnd: 45,
  lineStart: 42,
  source: "coderabbit",
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AnnotationRepo", () => {
  it("adds a single annotation and retrieves it", () => {
    runEffect(
      Effect.gen(function* () {
        const repo = yield* AnnotationRepo;
        const created = yield* repo.add(REVIEW_ID, [makeInput()]);
        expect(created).toHaveLength(1);
        expect(created[0]!.source).toBe("coderabbit");
        expect(created[0]!.content).toBe("Missing null check");
        expect(created[0]!.side).toBe("new");
        expect(created[0]!.type).toBe("comment");
      })
    );
  });

  it("batch adds multiple annotations", () => {
    runEffect(
      Effect.gen(function* () {
        const repo = yield* AnnotationRepo;
        const inputs = Array.from({ length: 5 }, (_, i) =>
          makeInput({ lineStart: i * 10, lineEnd: i * 10 + 5 })
        );
        const created = yield* repo.add(REVIEW_ID, inputs);
        expect(created).toHaveLength(5);
      })
    );
  });

  it("finds annotations by review", () => {
    runEffect(
      Effect.gen(function* () {
        const repo = yield* AnnotationRepo;
        yield* repo.add(REVIEW_ID, [
          makeInput({ filePath: "a.ts" }),
          makeInput({ filePath: "b.ts" }),
        ]);
        const all = yield* repo.findByReview(REVIEW_ID);
        expect(all).toHaveLength(2);
      })
    );
  });

  it("finds annotations by file path", () => {
    runEffect(
      Effect.gen(function* () {
        const repo = yield* AnnotationRepo;
        yield* repo.add(REVIEW_ID, [
          makeInput({ filePath: "a.ts" }),
          makeInput({ filePath: "b.ts" }),
          makeInput({ filePath: "a.ts", lineStart: 100, lineEnd: 110 }),
        ]);
        const aOnly = yield* repo.findByFile(REVIEW_ID, "a.ts");
        expect(aOnly).toHaveLength(2);
      })
    );
  });

  it("removes by ID", () => {
    runEffect(
      Effect.gen(function* () {
        const repo = yield* AnnotationRepo;
        const [ann] = yield* repo.add(REVIEW_ID, [makeInput()]);
        const removed = yield* repo.removeById(ann!.id);
        expect(removed).toBe(true);
        const remaining = yield* repo.findByReview(REVIEW_ID);
        expect(remaining).toHaveLength(0);
      })
    );
  });

  it("clears by source — only removes matching source", () => {
    runEffect(
      Effect.gen(function* () {
        const repo = yield* AnnotationRepo;
        yield* repo.add(REVIEW_ID, [
          makeInput({ source: "coderabbit" }),
          makeInput({ source: "coderabbit" }),
          makeInput({ source: "copilot" }),
        ]);
        const deleted = yield* repo.clearBySource(REVIEW_ID, "coderabbit");
        expect(deleted).toBe(2);
        const remaining = yield* repo.findByReview(REVIEW_ID);
        expect(remaining).toHaveLength(1);
        expect(remaining[0]!.source).toBe("copilot");
      })
    );
  });

  it("counts annotations by review", () => {
    runEffect(
      Effect.gen(function* () {
        const repo = yield* AnnotationRepo;
        yield* repo.add(REVIEW_ID, [makeInput(), makeInput(), makeInput()]);
        const count = yield* repo.countByReview(REVIEW_ID);
        expect(count).toBe(3);
      })
    );
  });

  it("cascades delete when review is deleted", () => {
    runEffect(
      Effect.gen(function* () {
        const repo = yield* AnnotationRepo;
        yield* repo.add(REVIEW_ID, [makeInput()]);
        Effect.runSync(
          Effect.sync(() => db.exec("DELETE FROM reviews WHERE id = 'rev-1'"))
        );
        const remaining = yield* repo.findByReview(REVIEW_ID);
        expect(remaining).toHaveLength(0);
      })
    );
  });

  it("handles batch of 200 annotations", () => {
    runEffect(
      Effect.gen(function* () {
        const repo = yield* AnnotationRepo;
        const inputs = Array.from({ length: 200 }, (_, i) =>
          makeInput({ lineStart: i, lineEnd: i + 1 })
        );
        const created = yield* repo.add(REVIEW_ID, inputs);
        expect(created).toHaveLength(200);
        const count = yield* repo.countByReview(REVIEW_ID);
        expect(count).toBe(200);
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Service tests
// ---------------------------------------------------------------------------

describe("AnnotationService", () => {
  it("stats aggregates by source", () => {
    runEffect(
      Effect.gen(function* () {
        const svc = yield* AnnotationService;
        yield* svc.add(REVIEW_ID, [
          makeInput({ source: "coderabbit" }),
          makeInput({ source: "coderabbit" }),
          makeInput({ source: "copilot" }),
        ]);
        const result = yield* svc.stats(REVIEW_ID);
        expect(result.total).toBe(3);
        expect(result.bySource).toEqual({ coderabbit: 2, copilot: 1 });
      })
    );
  });

  it("comments table is completely unaffected by annotations", () => {
    runEffect(
      Effect.gen(function* () {
        const svc = yield* AnnotationService;
        yield* svc.add(REVIEW_ID, [makeInput()]);

        // Check comments table is empty — annotations don't touch it
        const commentCount = Effect.runSync(
          Effect.sync(() => {
            const row = db
              .prepare("SELECT COUNT(*) as count FROM comments")
              .get() as { count: number };
            return row.count;
          })
        );
        expect(commentCount).toBe(0);
      })
    );
  });
});
