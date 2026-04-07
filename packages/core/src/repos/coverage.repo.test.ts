import { DatabaseSync } from "node:sqlite";

import { SqliteService } from "@ringi/core/db/database";
import { runMigrations } from "@ringi/core/db/migrations";
import { CoverageRepo } from "@ringi/core/repos/coverage.repo";
import { ReviewFileRepo } from "@ringi/core/repos/review-file.repo";
import { ReviewHunkRepo } from "@ringi/core/repos/review-hunk.repo";
import { deriveHunkId } from "@ringi/core/schemas/diff";
import type { ReviewId } from "@ringi/core/schemas/review";
import { CoverageService } from "@ringi/core/services/coverage.service";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

let db: DatabaseSync;
type Deps = CoverageRepo | CoverageService | ReviewHunkRepo | ReviewFileRepo;
let runEffect: <A, E>(effect: Effect.Effect<A, E, Deps>) => A;

const REVIEW_ID = "rev-1" as ReviewId;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA foreign_keys=ON");
  runMigrations(db);

  // Seed review + file + hunks
  db.exec(
    `INSERT INTO reviews (id, repository_path, snapshot_data, status, source_type)
     VALUES ('rev-1', '/tmp/repo', '{}', 'in_progress', 'staged')`
  );
  db.exec(
    `INSERT INTO review_files (id, review_id, file_path, status, additions, deletions, hunks_data)
     VALUES ('rf-1', 'rev-1', 'src/index.ts', 'modified', 10, 2, '[]')`
  );
  db.exec(
    `INSERT INTO review_files (id, review_id, file_path, status, additions, deletions, hunks_data)
     VALUES ('rf-2', 'rev-1', 'src/auth.ts', 'added', 50, 0, '[]')`
  );

  // Seed hunk rows
  const hunk1 = deriveHunkId("src/index.ts", 1, 3, 1, 5);
  const hunk2 = deriveHunkId("src/index.ts", 20, 3, 22, 5);
  const hunk3 = deriveHunkId("src/auth.ts", 1, 0, 1, 50);

  db.exec(
    `INSERT INTO review_hunks (id, review_file_id, hunk_index, old_start, old_lines, new_start, new_lines, stable_id)
     VALUES ('rh-1', 'rf-1', 0, 1, 3, 1, 5, '${hunk1}')`
  );
  db.exec(
    `INSERT INTO review_hunks (id, review_file_id, hunk_index, old_start, old_lines, new_start, new_lines, stable_id)
     VALUES ('rh-2', 'rf-1', 1, 20, 3, 22, 5, '${hunk2}')`
  );
  db.exec(
    `INSERT INTO review_hunks (id, review_file_id, hunk_index, old_start, old_lines, new_start, new_lines, stable_id)
     VALUES ('rh-3', 'rf-2', 0, 1, 0, 1, 50, '${hunk3}')`
  );

  const testSqlite = Layer.succeed(SqliteService, SqliteService.of({ db }));

  const repoLayer = Layer.mergeAll(
    CoverageRepo.Default,
    ReviewHunkRepo.Default,
    ReviewFileRepo.Default
  ).pipe(Layer.provide(testSqlite));

  const serviceLayer = CoverageService.Default.pipe(Layer.provide(repoLayer));

  const testLayer = Layer.mergeAll(repoLayer, serviceLayer);

  runEffect = <A, E>(effect: Effect.Effect<A, E, Deps>) =>
    Effect.runSync(Effect.provide(effect, testLayer));
});

afterEach(() => {
  db.close();
});

// ---------------------------------------------------------------------------
// Repo tests
// ---------------------------------------------------------------------------

describe("CoverageRepo", () => {
  it("marks and retrieves full hunk coverage", () => {
    const hunkId = deriveHunkId("src/index.ts", 1, 3, 1, 5);
    runEffect(
      Effect.gen(function* () {
        const repo = yield* CoverageRepo;
        yield* repo.markRange(REVIEW_ID, hunkId, null, null);
        const rows = yield* repo.findByHunk(REVIEW_ID, hunkId);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.start_line).toBeNull();
        expect(rows[0]!.end_line).toBeNull();
      })
    );
  });

  it("marks and retrieves line range coverage", () => {
    const hunkId = deriveHunkId("src/index.ts", 1, 3, 1, 5);
    runEffect(
      Effect.gen(function* () {
        const repo = yield* CoverageRepo;
        yield* repo.markRange(REVIEW_ID, hunkId, 0, 5);
        const rows = yield* repo.findByHunk(REVIEW_ID, hunkId);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.start_line).toBe(0);
        expect(rows[0]!.end_line).toBe(5);
      })
    );
  });

  it("unmarks all coverage for a hunk", () => {
    const hunkId = deriveHunkId("src/index.ts", 1, 3, 1, 5);
    runEffect(
      Effect.gen(function* () {
        const repo = yield* CoverageRepo;
        yield* repo.markRange(REVIEW_ID, hunkId, 0, 3);
        yield* repo.markRange(REVIEW_ID, hunkId, 4, 8);
        yield* repo.unmark(REVIEW_ID, hunkId);
        const rows = yield* repo.findByHunk(REVIEW_ID, hunkId);
        expect(rows).toHaveLength(0);
      })
    );
  });

  it("cascade deletes coverage when review is deleted", () => {
    const hunkId = deriveHunkId("src/index.ts", 1, 3, 1, 5);
    runEffect(
      Effect.gen(function* () {
        const repo = yield* CoverageRepo;
        yield* repo.markRange(REVIEW_ID, hunkId, null, null);
        Effect.runSync(
          Effect.sync(() => db.exec("DELETE FROM reviews WHERE id = 'rev-1'"))
        );
        const rows = yield* repo.findByReview(REVIEW_ID);
        expect(rows).toHaveLength(0);
      })
    );
  });

  it("deletes all coverage by review ID", () => {
    const h1 = deriveHunkId("src/index.ts", 1, 3, 1, 5);
    const h2 = deriveHunkId("src/auth.ts", 1, 0, 1, 50);
    runEffect(
      Effect.gen(function* () {
        const repo = yield* CoverageRepo;
        yield* repo.markRange(REVIEW_ID, h1, null, null);
        yield* repo.markRange(REVIEW_ID, h2, 0, 10);
        const deleted = yield* repo.deleteByReview(REVIEW_ID);
        expect(deleted).toBe(2);
        const rows = yield* repo.findByReview(REVIEW_ID);
        expect(rows).toHaveLength(0);
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Service tests
// ---------------------------------------------------------------------------

describe("CoverageService", () => {
  it("reports correct summary for no coverage", () => {
    runEffect(
      Effect.gen(function* () {
        const svc = yield* CoverageService;
        const summary = yield* svc.getSummary(REVIEW_ID);
        expect(summary).toEqual({
          partialHunks: 0,
          reviewedHunks: 0,
          totalHunks: 3,
          unreviewedHunks: 3,
        });
      })
    );
  });

  it("counts full-hunk marks as reviewed", () => {
    const hunkId = deriveHunkId("src/index.ts", 1, 3, 1, 5);
    runEffect(
      Effect.gen(function* () {
        const svc = yield* CoverageService;
        yield* svc.markHunkReviewed(REVIEW_ID, hunkId);
        const summary = yield* svc.getSummary(REVIEW_ID);
        expect(summary.reviewedHunks).toBe(1);
        expect(summary.unreviewedHunks).toBe(2);
      })
    );
  });

  it("counts range marks as partial", () => {
    const hunkId = deriveHunkId("src/index.ts", 1, 3, 1, 5);
    runEffect(
      Effect.gen(function* () {
        const svc = yield* CoverageService;
        yield* svc.markRangeReviewed(REVIEW_ID, hunkId, 0, 2);
        const summary = yield* svc.getSummary(REVIEW_ID);
        expect(summary.partialHunks).toBe(1);
        expect(summary.reviewedHunks).toBe(0);
        expect(summary.unreviewedHunks).toBe(2);
      })
    );
  });

  it("unmark removes coverage", () => {
    const hunkId = deriveHunkId("src/index.ts", 1, 3, 1, 5);
    runEffect(
      Effect.gen(function* () {
        const svc = yield* CoverageService;
        yield* svc.markHunkReviewed(REVIEW_ID, hunkId);
        yield* svc.unmark(REVIEW_ID, hunkId);
        const summary = yield* svc.getSummary(REVIEW_ID);
        expect(summary.reviewedHunks).toBe(0);
        expect(summary.unreviewedHunks).toBe(3);
      })
    );
  });

  it("coverage is independent from comments — no coupling", () => {
    const hunkId = deriveHunkId("src/index.ts", 1, 3, 1, 5);
    runEffect(
      Effect.gen(function* () {
        const svc = yield* CoverageService;
        yield* svc.markHunkReviewed(REVIEW_ID, hunkId);

        // Add and then delete a comment
        Effect.runSync(
          Effect.sync(() => {
            db.exec(
              `INSERT INTO comments (id, review_id, file_path, content) VALUES ('c-1', 'rev-1', 'src/index.ts', 'test')`
            );
            db.exec("DELETE FROM comments WHERE id = 'c-1'");
          })
        );

        // Coverage should be unaffected
        const summary = yield* svc.getSummary(REVIEW_ID);
        expect(summary.reviewedHunks).toBe(1);
      })
    );
  });

  it("handles bulk coverage for large reviews", () => {
    runEffect(
      Effect.gen(function* () {
        const repo = yield* CoverageRepo;
        // Create 500 coverage entries
        for (let i = 0; i < 500; i++) {
          yield* repo.markRange(
            REVIEW_ID,
            `fake-hunk-${i}`,
            i * 10,
            i * 10 + 5
          );
        }
        const rows = yield* repo.findByReview(REVIEW_ID);
        expect(rows).toHaveLength(500);
      })
    );
  });
});
