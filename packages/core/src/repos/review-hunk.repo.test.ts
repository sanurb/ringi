import { DatabaseSync } from "node:sqlite";

import { SqliteService } from "@ringi/core/db/database";
import { runMigrations } from "@ringi/core/db/migrations";
import {
  ReviewHunkRepo,
  type CreateReviewHunkInput,
} from "@ringi/core/repos/review-hunk.repo";
import { deriveHunkId } from "@ringi/core/schemas/diff";
import type { ReviewId } from "@ringi/core/schemas/review";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Test infrastructure — in-memory SQLite with full migrations
// ---------------------------------------------------------------------------

let db: DatabaseSync;
let runEffect: <A, E>(effect: Effect.Effect<A, E, ReviewHunkRepo>) => A;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA foreign_keys=ON");
  runMigrations(db);

  // Seed a review + review_file for FK constraints
  db.exec(
    `INSERT INTO reviews (id, repository_path, snapshot_data, status, source_type)
     VALUES ('rev-1', '/tmp/repo', '{}', 'in_progress', 'staged')`
  );
  db.exec(
    `INSERT INTO review_files (id, review_id, file_path, status, additions, deletions)
     VALUES ('rf-1', 'rev-1', 'src/index.ts', 'modified', 10, 2)`
  );
  db.exec(
    `INSERT INTO review_files (id, review_id, file_path, status, additions, deletions)
     VALUES ('rf-2', 'rev-1', 'src/auth.ts', 'added', 50, 0)`
  );

  const testSqlite = Layer.succeed(SqliteService, SqliteService.of({ db }));
  const testRepo = ReviewHunkRepo.Default.pipe(Layer.provide(testSqlite));

  runEffect = <A, E>(effect: Effect.Effect<A, E, ReviewHunkRepo>) =>
    Effect.runSync(Effect.provide(effect, testRepo));
});

afterEach(() => {
  db.close();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ReviewHunkRepo", () => {
  const makeHunk = (
    reviewFileId: string,
    idx: number,
    oldStart: number
  ): CreateReviewHunkInput => ({
    hunkIndex: idx,
    newLines: 5,
    newStart: oldStart + 2,
    oldLines: 3,
    oldStart,
    reviewFileId,
    stableId: deriveHunkId("src/index.ts", oldStart, 3, oldStart + 2, 5),
  });

  it("creates and retrieves hunks by review file", () => {
    const hunks = [makeHunk("rf-1", 0, 1), makeHunk("rf-1", 1, 20)];

    runEffect(
      Effect.gen(function* () {
        const repo = yield* ReviewHunkRepo;
        yield* repo.createBulk(hunks);
        const result = yield* repo.findByReviewFile("rf-1");
        expect(result).toHaveLength(2);
        expect(result[0]!.hunkIndex).toBe(0);
        expect(result[1]!.hunkIndex).toBe(1);
        expect(result[0]!.stableId).toBe(hunks[0]!.stableId);
      })
    );
  });

  it("finds by stable ID", () => {
    const hunk = makeHunk("rf-1", 0, 10);

    runEffect(
      Effect.gen(function* () {
        const repo = yield* ReviewHunkRepo;
        yield* repo.createBulk([hunk]);
        const found = yield* repo.findByStableId("rf-1", hunk.stableId);
        expect(found).not.toBeNull();
        expect(found!.oldStart).toBe(10);
      })
    );
  });

  it("returns null for non-existent stable ID", () => {
    runEffect(
      Effect.gen(function* () {
        const repo = yield* ReviewHunkRepo;
        const found = yield* repo.findByStableId("rf-1", "nonexistent");
        expect(found).toBeNull();
      })
    );
  });

  it("enforces unique constraint on (review_file_id, stable_id)", () => {
    const hunk = makeHunk("rf-1", 0, 1);

    expect(() =>
      runEffect(
        Effect.gen(function* () {
          const repo = yield* ReviewHunkRepo;
          yield* repo.createBulk([hunk]);
          yield* repo.createBulk([hunk]); // duplicate
        })
      )
    ).toThrow();
  });

  it("cascades delete when review_file is deleted", () => {
    runEffect(
      Effect.gen(function* () {
        const repo = yield* ReviewHunkRepo;
        yield* repo.createBulk([makeHunk("rf-1", 0, 1)]);

        // Delete the review_file — hunks should cascade
        Effect.runSync(
          Effect.sync(() => {
            db.exec("DELETE FROM review_files WHERE id = 'rf-1'");
          })
        );

        const result = yield* repo.findByReviewFile("rf-1");
        expect(result).toHaveLength(0);
      })
    );
  });

  it("cascades delete when review is deleted", () => {
    runEffect(
      Effect.gen(function* () {
        const repo = yield* ReviewHunkRepo;
        yield* repo.createBulk([
          makeHunk("rf-1", 0, 1),
          makeHunk("rf-2", 0, 1),
        ]);

        // Delete the review — files and hunks should cascade
        Effect.runSync(
          Effect.sync(() => {
            db.exec("DELETE FROM reviews WHERE id = 'rev-1'");
          })
        );

        const r1 = yield* repo.findByReviewFile("rf-1");
        const r2 = yield* repo.findByReviewFile("rf-2");
        expect(r1).toHaveLength(0);
        expect(r2).toHaveLength(0);
      })
    );
  });

  it("deletes by review ID", () => {
    runEffect(
      Effect.gen(function* () {
        const repo = yield* ReviewHunkRepo;
        yield* repo.createBulk([
          makeHunk("rf-1", 0, 1),
          makeHunk("rf-2", 0, 1),
        ]);

        const deleted = yield* repo.deleteByReview("rev-1" as ReviewId);
        expect(deleted).toBe(2);

        const remaining = yield* repo.findByReviewFile("rf-1");
        expect(remaining).toHaveLength(0);
      })
    );
  });

  it("handles bulk insert of 100+ hunks", () => {
    const hunks: CreateReviewHunkInput[] = Array.from(
      { length: 150 },
      (_, i) => ({
        hunkIndex: i,
        newLines: 1,
        newStart: i * 10 + 2,
        oldLines: 1,
        oldStart: i * 10,
        reviewFileId: "rf-1",
        stableId: deriveHunkId("src/index.ts", i * 10, 1, i * 10 + 2, 1),
      })
    );

    runEffect(
      Effect.gen(function* () {
        const repo = yield* ReviewHunkRepo;
        yield* repo.createBulk(hunks);
        const result = yield* repo.findByReviewFile("rf-1");
        expect(result).toHaveLength(150);
      })
    );
  });

  it("preserves all fields through write→read roundtrip", () => {
    const input: CreateReviewHunkInput = {
      hunkIndex: 3,
      newLines: 15,
      newStart: 42,
      oldLines: 10,
      oldStart: 40,
      reviewFileId: "rf-1",
      stableId: deriveHunkId("src/index.ts", 40, 10, 42, 15),
    };

    runEffect(
      Effect.gen(function* () {
        const repo = yield* ReviewHunkRepo;
        yield* repo.createBulk([input]);
        const found = yield* repo.findByStableId("rf-1", input.stableId);
        expect(found).not.toBeNull();
        expect(found!.hunkIndex).toBe(3);
        expect(found!.oldStart).toBe(40);
        expect(found!.oldLines).toBe(10);
        expect(found!.newStart).toBe(42);
        expect(found!.newLines).toBe(15);
        expect(found!.stableId).toBe(input.stableId);
        expect(found!.reviewFileId).toBe("rf-1");
        expect(found!.id).toBeTruthy();
        expect(found!.createdAt).toBeTruthy();
      })
    );
  });
});
