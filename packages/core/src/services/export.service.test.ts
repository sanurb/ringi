import { DatabaseSync } from "node:sqlite";

import { SqliteService } from "@ringi/core/db/database";
import { runMigrations } from "@ringi/core/db/migrations";
import { AnnotationRepo } from "@ringi/core/repos/annotation.repo";
import { CommentRepo } from "@ringi/core/repos/comment.repo";
import { CoverageRepo } from "@ringi/core/repos/coverage.repo";
import { ReviewFileRepo } from "@ringi/core/repos/review-file.repo";
import { ReviewHunkRepo } from "@ringi/core/repos/review-hunk.repo";
import { ReviewRepo } from "@ringi/core/repos/review.repo";
import { TodoRepo } from "@ringi/core/repos/todo.repo";
import type { ReviewId } from "@ringi/core/schemas/review";
import { AnnotationService } from "@ringi/core/services/annotation.service";
import { CommentService } from "@ringi/core/services/comment.service";
import { ReviewContextBuilder } from "@ringi/core/services/context-builder.service";
import { CoverageService } from "@ringi/core/services/coverage.service";
import { ExportService } from "@ringi/core/services/export.service";
import { ReviewService } from "@ringi/core/services/review.service";
import { TodoService } from "@ringi/core/services/todo.service";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GitError, GitService } from "./git.service";

let db: DatabaseSync;
let runEffect: <A, E>(effect: Effect.Effect<A, E, ExportService>) => A;

const REVIEW_ID = "rev-export-1" as ReviewId;
const EMPTY_REVIEW_ID = "rev-export-empty" as ReviewId;
const FILE_PATH = "src/auth.ts";

const testGitService = Layer.succeed(
  GitService,
  GitService.of({
    getRepositoryPath: Effect.fail(
      new GitError({ message: "no real git in test" })
    ),
    getRepositoryInfo: Effect.fail(
      new GitError({ message: "no real git in test" })
    ),
    hasCommits: Effect.succeed(true),
    getStagedDiff: Effect.succeed(""),
    getStagedFiles: Effect.succeed([]),
    getUncommittedDiff: Effect.succeed(""),
    getUncommittedFiles: Effect.succeed([]),
    getUnstagedDiff: Effect.succeed(""),
    getUnstagedFiles: Effect.succeed([]),
    getLastCommitDiff: Effect.succeed(""),
    getLastCommitFiles: Effect.succeed([]),
    getBranchDiff: () => Effect.succeed(""),
    getCommitDiff: () => Effect.succeed(""),
    getFileContent: () => Effect.succeed(""),
    getFileTree: () => Effect.succeed([]),
    getBranches: Effect.succeed([]),
    getCommits: () => Effect.succeed({ commits: [], hasMore: false }),
    stageFiles: () => Effect.succeed([]),
    stageAll: Effect.succeed([]),
    unstageFiles: () => Effect.succeed([]),
  })
);

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA foreign_keys=ON");
  runMigrations(db);

  const snapshotData = JSON.stringify({
    repository: { name: "ringi", branch: "main", path: "/tmp/ringi" },
    version: 2,
  }).replace(/'/g, "''");

  db.exec(
    `INSERT INTO reviews (id, repository_path, snapshot_data, status, source_type, source_ref)
     VALUES ('${REVIEW_ID}', '/tmp/ringi', '${snapshotData}', 'in_progress', 'staged', NULL)`
  );
  db.exec(
    `INSERT INTO reviews (id, repository_path, snapshot_data, status, source_type, source_ref)
     VALUES ('${EMPTY_REVIEW_ID}', '/tmp/ringi', '${snapshotData}', 'approved', 'staged', NULL)`
  );

  const hunksData = JSON.stringify([
    {
      oldStart: 1,
      oldLines: 1,
      newStart: 1,
      newLines: 2,
      lines: [
        {
          type: "context",
          content: "function validate(user) {",
          oldLineNumber: 1,
          newLineNumber: 1,
        },
        {
          type: "added",
          content: "  return user.id !== undefined;",
          oldLineNumber: null,
          newLineNumber: 2,
        },
      ],
    },
  ]).replace(/'/g, "''");

  db.exec(
    `INSERT INTO review_files (id, review_id, file_path, old_path, status, additions, deletions, hunks_data)
     VALUES ('rf-1', '${REVIEW_ID}', '${FILE_PATH}', NULL, 'modified', 1, 0, '${hunksData}')`
  );

  const stableId = `${FILE_PATH}:@-1,1+1,2`;
  db.exec(
    `INSERT INTO review_hunks (id, review_file_id, hunk_index, old_start, old_lines, new_start, new_lines, stable_id)
     VALUES ('rh-1', 'rf-1', 0, 1, 1, 1, 2, '${stableId}')`
  );

  db.exec(
    `INSERT INTO comments (id, review_id, file_path, line_number, line_type, content, suggestion, resolved)
     VALUES ('c-1', '${REVIEW_ID}', '${FILE_PATH}', 2, 'added', 'Guard against missing ids', NULL, 0)`
  );
  db.exec(
    `INSERT INTO todos (id, content, completed, review_id, position)
     VALUES ('t-1', 'Handle missing ids before returning', 0, '${REVIEW_ID}', 0)`
  );

  const testSqlite = Layer.succeed(SqliteService, SqliteService.of({ db }));

  const repoLayer = Layer.mergeAll(
    AnnotationRepo.Default,
    ReviewRepo.Default,
    ReviewFileRepo.Default,
    ReviewHunkRepo.Default,
    CommentRepo.Default,
    CoverageRepo.Default,
    TodoRepo.Default
  ).pipe(Layer.provide(testSqlite));

  const commentServiceLayer = CommentService.Default.pipe(
    Layer.provide(CommentRepo.Default),
    Layer.provide(testSqlite)
  );
  const todoServiceLayer = TodoService.Default.pipe(
    Layer.provide(TodoRepo.Default),
    Layer.provide(testSqlite)
  );
  const annotationServiceLayer = AnnotationService.Default.pipe(
    Layer.provide(AnnotationRepo.Default),
    Layer.provide(testSqlite)
  );
  const coverageServiceLayer = CoverageService.Default.pipe(
    Layer.provide(CoverageRepo.Default),
    Layer.provide(ReviewHunkRepo.Default),
    Layer.provide(ReviewFileRepo.Default),
    Layer.provide(testSqlite)
  );
  const reviewServiceLayer = ReviewService.Default.pipe(
    Layer.provide(ReviewRepo.Default),
    Layer.provide(ReviewFileRepo.Default),
    Layer.provide(ReviewHunkRepo.Default),
    Layer.provide(testGitService),
    Layer.provide(testSqlite)
  );
  const builderLayer = ReviewContextBuilder.Default.pipe(
    Layer.provide(reviewServiceLayer),
    Layer.provide(commentServiceLayer),
    Layer.provide(coverageServiceLayer),
    Layer.provide(annotationServiceLayer),
    Layer.provide(todoServiceLayer),
    Layer.provide(ReviewFileRepo.Default),
    Layer.provide(ReviewHunkRepo.Default),
    Layer.provide(CoverageRepo.Default),
    Layer.provide(testSqlite)
  );
  const exportServiceLayer = ExportService.Default.pipe(
    Layer.provide(reviewServiceLayer),
    Layer.provide(commentServiceLayer),
    Layer.provide(todoServiceLayer),
    Layer.provide(builderLayer)
  );

  const testLayer = Layer.mergeAll(exportServiceLayer, builderLayer, repoLayer);

  runEffect = <A, E>(effect: Effect.Effect<A, E, ExportService>) =>
    Effect.runSync(Effect.provide(effect, testLayer));
});

afterEach(() => {
  db.close();
});

describe("ExportService.exportAsPrompt", () => {
  it("returns the generated feedback prompt when actionable feedback exists", () => {
    const result = runEffect(
      Effect.gen(function* () {
        const service = yield* ExportService;
        return yield* service.exportAsPrompt(REVIEW_ID);
      })
    );

    expect(result).toContain(
      "Please address the following review feedback for ringi:main:"
    );
    expect(result).toMatch(/^1\. /m);
    expect(result).toContain("Guard against missing ids");
    expect(result).toContain("Handle missing ids before returning");
  });

  it("returns a no-feedback message when the prompt has no actionable items", () => {
    const result = runEffect(
      Effect.gen(function* () {
        const service = yield* ExportService;
        return yield* service.exportAsPrompt(EMPTY_REVIEW_ID);
      })
    );

    expect(result).toBe("No feedback to report.");
  });
});
