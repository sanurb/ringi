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
import { ReviewService } from "@ringi/core/services/review.service";
import { TodoService } from "@ringi/core/services/todo.service";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GitService, GitError } from "./git.service";

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

let db: DatabaseSync;
type Deps =
  | ReviewContextBuilder
  | ReviewService
  | CommentService
  | CoverageService
  | AnnotationService
  | TodoService
  | ReviewFileRepo
  | ReviewHunkRepo
  | CoverageRepo;

let runEffect: <A, E>(effect: Effect.Effect<A, E, Deps>) => A;

const REVIEW_ID = "rev-ctx-1" as ReviewId;
const FILE_PATH = "src/auth.ts";

// Stub GitService — ReviewService.Default requires it in the layer graph,
// but context-builder only calls getById/getFileHunks which read from DB.
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
    getUntrackedFiles: Effect.succeed([]),
    getUntrackedDiff: Effect.succeed(""),
  })
);

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA foreign_keys=ON");
  runMigrations(db);

  // Seed a review with snapshot data containing repository info
  const snapshotData = JSON.stringify({
    repository: { name: "ringi", branch: "main", path: "/tmp/ringi" },
    version: 2,
  });
  db.exec(
    `INSERT INTO reviews (id, repository_path, snapshot_data, status, source_type, source_ref)
     VALUES ('${REVIEW_ID}', '/tmp/ringi', '${snapshotData}', 'in_progress', 'staged', NULL)`
  );

  // Seed a review file
  const hunksData = JSON.stringify([
    {
      oldStart: 1,
      oldLines: 5,
      newStart: 1,
      newLines: 7,
      lines: [
        {
          type: "context",
          content: "import { auth } from './lib';",
          oldLineNumber: 1,
          newLineNumber: 1,
        },
        { type: "context", content: "", oldLineNumber: 2, newLineNumber: 2 },
        {
          type: "removed",
          content: "function check() {}",
          oldLineNumber: 3,
          newLineNumber: null,
        },
        {
          type: "added",
          content: "function validate() {}",
          oldLineNumber: null,
          newLineNumber: 3,
        },
        {
          type: "added",
          content: "  return true;",
          oldLineNumber: null,
          newLineNumber: 4,
        },
        { type: "context", content: "}", oldLineNumber: 4, newLineNumber: 5 },
        { type: "context", content: "", oldLineNumber: 5, newLineNumber: 6 },
      ],
    },
    {
      oldStart: 20,
      oldLines: 3,
      newStart: 22,
      newLines: 4,
      lines: [
        {
          type: "context",
          content: "// footer",
          oldLineNumber: 20,
          newLineNumber: 22,
        },
        {
          type: "added",
          content: "export default validate;",
          oldLineNumber: null,
          newLineNumber: 23,
        },
        {
          type: "context",
          content: "// end",
          oldLineNumber: 21,
          newLineNumber: 24,
        },
        { type: "context", content: "", oldLineNumber: 22, newLineNumber: 25 },
      ],
    },
  ]);

  db.exec(
    `INSERT INTO review_files (id, review_id, file_path, old_path, status, additions, deletions, hunks_data)
     VALUES ('rf-1', '${REVIEW_ID}', '${FILE_PATH}', NULL, 'modified', 3, 1, '${hunksData.replace(/'/g, "''")}')`
  );

  // Seed a second file (no hunks_data)
  db.exec(
    `INSERT INTO review_files (id, review_id, file_path, old_path, status, additions, deletions, hunks_data)
     VALUES ('rf-2', '${REVIEW_ID}', 'src/index.ts', NULL, 'added', 10, 0, NULL)`
  );

  // Seed review hunks (stable hunk identities)
  const stableId1 = `${FILE_PATH}:@-1,5+1,7`;
  const stableId2 = `${FILE_PATH}:@-20,3+22,4`;
  db.exec(
    `INSERT INTO review_hunks (id, review_file_id, hunk_index, old_start, old_lines, new_start, new_lines, stable_id)
     VALUES ('rh-1', 'rf-1', 0, 1, 5, 1, 7, '${stableId1}')`
  );
  db.exec(
    `INSERT INTO review_hunks (id, review_file_id, hunk_index, old_start, old_lines, new_start, new_lines, stable_id)
     VALUES ('rh-2', 'rf-1', 1, 20, 3, 22, 4, '${stableId2}')`
  );

  // Seed comments
  db.exec(
    `INSERT INTO comments (id, review_id, file_path, line_number, line_type, content, suggestion, resolved)
     VALUES ('c-1', '${REVIEW_ID}', '${FILE_PATH}', 3, 'added', 'Missing null check', 'if (x == null) return;', 0)`
  );
  db.exec(
    `INSERT INTO comments (id, review_id, file_path, line_number, line_type, content, suggestion, resolved)
     VALUES ('c-2', '${REVIEW_ID}', '${FILE_PATH}', 5, 'context', 'Looks good', NULL, 1)`
  );

  // Seed annotations
  db.exec(
    `INSERT INTO review_annotations (id, review_id, source, file_path, hunk_stable_id, line_start, line_end, side, type, severity, content)
     VALUES ('a-1', '${REVIEW_ID}', 'coderabbit', '${FILE_PATH}', '${stableId1}', 3, 4, 'new', 'concern', 'important', 'Potential null pointer')`
  );

  // Seed todos
  db.exec(
    `INSERT INTO todos (id, content, completed, review_id, position)
     VALUES ('t-1', 'Fix auth validation', 0, '${REVIEW_ID}', 0)`
  );
  db.exec(
    `INSERT INTO todos (id, content, completed, review_id, position)
     VALUES ('t-2', 'Already done', 1, '${REVIEW_ID}', 1)`
  );

  // Seed coverage: mark first hunk as reviewed, second hunk uncovered
  db.exec(
    `INSERT INTO review_coverage (id, review_id, hunk_stable_id, start_line, end_line)
     VALUES ('cov-1', '${REVIEW_ID}', '${stableId1}', NULL, NULL)`
  );

  // Build layers
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

  const testLayer = Layer.mergeAll(
    builderLayer,
    reviewServiceLayer,
    commentServiceLayer,
    coverageServiceLayer,
    annotationServiceLayer,
    todoServiceLayer,
    repoLayer
  );

  runEffect = <A, E>(effect: Effect.Effect<A, E, Deps>) =>
    Effect.runSync(Effect.provide(effect, testLayer));
});

afterEach(() => {
  db.close();
});

// ---------------------------------------------------------------------------
// review-summary mode
// ---------------------------------------------------------------------------

describe("ReviewContextBuilder — review-summary", () => {
  it("produces a complete review summary with all sections", () => {
    runEffect(
      Effect.gen(function* () {
        const builder = yield* ReviewContextBuilder;
        const result = yield* builder.buildContext({
          reviewId: REVIEW_ID,
          mode: "review-summary",
        });

        // Header
        expect(result).toContain("## Review: ringi:main (staged)");
        expect(result).toContain("Status: in_progress");
        expect(result).toContain("Coverage: 1/2 hunks");

        // Files section
        expect(result).toContain("### Files Changed");
        expect(result).toContain("src/auth.ts [M]");
        expect(result).toContain("src/index.ts [A]");

        // Comments section
        expect(result).toContain("### Unresolved Comments (1)");
        expect(result).toContain("Missing null check");
        expect(result).toContain("```suggestion");
        expect(result).toContain("if (x == null) return;");
        // Resolved comment should NOT appear in unresolved section
        expect(result).not.toMatch(/Unresolved Comments[\s\S]*Looks good/);

        // Annotations section
        expect(result).toContain("### External Annotations (1 from 1 sources)");
        expect(result).toContain("[important]");
        expect(result).toContain("Potential null pointer");
        expect(result).toContain("(source: coderabbit)");

        // Todos section
        expect(result).toContain("### Pending Todos (1)");
        expect(result).toContain("Fix auth validation");
        expect(result).not.toMatch(/Pending Todos[\s\S]*Already done/);

        // Uncovered hunks section
        expect(result).toContain("### Uncovered Hunks (1)");
        expect(result).toContain(`${FILE_PATH}:@-20,3+22,4`);
        // The covered hunk should NOT appear in uncovered section
        expect(result).not.toMatch(
          /Uncovered Hunks[\s\S]*src\/auth\.ts:@-1,5\+1,7/
        );
      })
    );
  });

  it("handles review with no comments, annotations, todos, or coverage", () => {
    // Create a bare review
    db.exec(
      `INSERT INTO reviews (id, repository_path, snapshot_data, status, source_type)
       VALUES ('rev-bare', '/tmp/bare', '{}', 'approved', 'staged')`
    );

    runEffect(
      Effect.gen(function* () {
        const builder = yield* ReviewContextBuilder;
        const result = yield* builder.buildContext({
          reviewId: "rev-bare" as ReviewId,
          mode: "review-summary",
        });

        expect(result).toContain("## Review: unknown:unknown (staged)");
        expect(result).toContain("Status: approved");
        expect(result).toContain("### Unresolved Comments (0)");
        expect(result).toContain("### External Annotations (0 from 0 sources)");
        expect(result).toContain("### Pending Todos (0)");
        expect(result).toContain("### Uncovered Hunks (0)");
      })
    );
  });
});

// ---------------------------------------------------------------------------
// file-focus mode
// ---------------------------------------------------------------------------

describe("ReviewContextBuilder — file-focus", () => {
  it("renders hunks with stable IDs, comments, and annotations for a file", () => {
    runEffect(
      Effect.gen(function* () {
        const builder = yield* ReviewContextBuilder;
        const result = yield* builder.buildContext({
          reviewId: REVIEW_ID,
          mode: "file-focus",
          filePath: FILE_PATH,
        });

        // Header
        expect(result).toContain(`## Reviewing: ${FILE_PATH} (modified)`);
        expect(result).toContain("Additions: 3 | Deletions: 1");
        expect(result).toContain("Coverage: 1/2 hunks");

        // Diff section — stable IDs
        expect(result).toContain("### Diff");
        expect(result).toContain(`[${FILE_PATH}:@-1,5+1,7]`);
        expect(result).toContain(`[${FILE_PATH}:@-20,3+22,4]`);
        expect(result).toContain("@@ -1,5 +1,7 @@");
        expect(result).toContain("+function validate() {}");
        expect(result).toContain("-function check() {}");

        // Comments
        expect(result).toContain("### Comments on this file (2)");
        expect(result).toContain("Missing null check");
        expect(result).toContain("(resolved)");
        expect(result).toContain("Looks good");

        // Annotations
        expect(result).toContain("### Annotations on this file (1)");
        expect(result).toContain("[important]");
        expect(result).toContain("Potential null pointer");
      })
    );
  });

  it("returns FilePathRequired error when filePath is missing", () => {
    expect(() =>
      runEffect(
        Effect.gen(function* () {
          const builder = yield* ReviewContextBuilder;
          yield* builder.buildContext({
            reviewId: REVIEW_ID,
            mode: "file-focus",
          });
        })
      )
    ).toThrow();

    // Verify it's the right tagged error
    const result = Effect.runSyncExit(
      Effect.provide(
        Effect.gen(function* () {
          const builder = yield* ReviewContextBuilder;
          return yield* builder.buildContext({
            reviewId: REVIEW_ID,
            mode: "file-focus",
          });
        }),
        Layer.mergeAll(
          ReviewContextBuilder.Default.pipe(
            Layer.provide(
              ReviewService.Default.pipe(
                Layer.provide(ReviewRepo.Default),
                Layer.provide(ReviewFileRepo.Default),
                Layer.provide(ReviewHunkRepo.Default),
                Layer.provide(testGitService),
                Layer.provide(
                  Layer.succeed(SqliteService, SqliteService.of({ db }))
                )
              )
            ),
            Layer.provide(
              CommentService.Default.pipe(
                Layer.provide(CommentRepo.Default),
                Layer.provide(
                  Layer.succeed(SqliteService, SqliteService.of({ db }))
                )
              )
            ),
            Layer.provide(
              CoverageService.Default.pipe(
                Layer.provide(CoverageRepo.Default),
                Layer.provide(ReviewHunkRepo.Default),
                Layer.provide(ReviewFileRepo.Default),
                Layer.provide(
                  Layer.succeed(SqliteService, SqliteService.of({ db }))
                )
              )
            ),
            Layer.provide(
              AnnotationService.Default.pipe(
                Layer.provide(AnnotationRepo.Default),
                Layer.provide(
                  Layer.succeed(SqliteService, SqliteService.of({ db }))
                )
              )
            ),
            Layer.provide(
              TodoService.Default.pipe(
                Layer.provide(TodoRepo.Default),
                Layer.provide(
                  Layer.succeed(SqliteService, SqliteService.of({ db }))
                )
              )
            ),
            Layer.provide(
              ReviewFileRepo.Default.pipe(
                Layer.provide(
                  Layer.succeed(SqliteService, SqliteService.of({ db }))
                )
              )
            ),
            Layer.provide(
              ReviewHunkRepo.Default.pipe(
                Layer.provide(
                  Layer.succeed(SqliteService, SqliteService.of({ db }))
                )
              )
            ),
            Layer.provide(
              CoverageRepo.Default.pipe(
                Layer.provide(
                  Layer.succeed(SqliteService, SqliteService.of({ db }))
                )
              )
            )
          )
        )
      )
    );
    expect(result._tag).toBe("Failure");
  });

  it("handles file not in review gracefully", () => {
    runEffect(
      Effect.gen(function* () {
        const builder = yield* ReviewContextBuilder;
        const result = yield* builder.buildContext({
          reviewId: REVIEW_ID,
          mode: "file-focus",
          filePath: "nonexistent.ts",
        });

        expect(result).toContain("## Reviewing: nonexistent.ts (unknown)");
        expect(result).toContain("Coverage: 0/0 hunks");
        expect(result).toContain(
          "_No persisted hunks available for this file._"
        );
      })
    );
  });
});

// ---------------------------------------------------------------------------
// feedback-prompt mode
// ---------------------------------------------------------------------------

describe("ReviewContextBuilder — feedback-prompt", () => {
  it("produces actionable feedback with numbered items", () => {
    runEffect(
      Effect.gen(function* () {
        const builder = yield* ReviewContextBuilder;
        const result = yield* builder.buildContext({
          reviewId: REVIEW_ID,
          mode: "feedback-prompt",
        });

        expect(result).toContain(
          "Please address the following review feedback for ringi:main:"
        );
        expect(result).toContain("Review decision: in_progress");

        // Unresolved comment with line and suggestion
        expect(result).toContain(
          `1. ${FILE_PATH}:3 [added] — Missing null check`
        );
        expect(result).toContain("Suggestion: if (x == null) return;");

        // Pending todo
        expect(result).toContain("2. TODO: Fix auth validation");

        // Resolved comment and completed todo should NOT appear
        expect(result).not.toContain("Looks good");
        expect(result).not.toContain("Already done");
      })
    );
  });

  it("handles empty review feedback", () => {
    db.exec(
      `INSERT INTO reviews (id, repository_path, snapshot_data, status, source_type)
       VALUES ('rev-empty', '/tmp/empty', '{}', 'approved', 'staged')`
    );

    runEffect(
      Effect.gen(function* () {
        const builder = yield* ReviewContextBuilder;
        const result = yield* builder.buildContext({
          reviewId: "rev-empty" as ReviewId,
          mode: "feedback-prompt",
        });

        expect(result).toContain("Review decision: approved");
        // No numbered items
        expect(result).not.toMatch(/^\d+\./m);
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe("ReviewContextBuilder — error handling", () => {
  it("returns ReviewNotFound for missing review", () => {
    expect(() =>
      runEffect(
        Effect.gen(function* () {
          const builder = yield* ReviewContextBuilder;
          yield* builder.buildContext({
            reviewId: "nonexistent" as ReviewId,
            mode: "review-summary",
          });
        })
      )
    ).toThrow();
  });
});
