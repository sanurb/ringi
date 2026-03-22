# SPEC-001: Review Lifecycle Specification

> Foundational, agent-executable lifecycle spec for ringi.
>
> Canonical sources cross-checked for this rewrite:
>
> - `docs/ARCHITECTURE.md` §7, §9, §11, §14
> - `docs/CLI.md` review commands
> - `src/routes/api/-lib/services/review.service.ts`
> - `src/routes/api/-lib/services/comment.service.ts`
> - `src/routes/api/-lib/services/export.service.ts`
> - `src/routes/api/-lib/db/migrations.ts`
> - `src/routes/api/-lib/repos/review.repo.ts`
> - `src/routes/api/-lib/repos/comment.repo.ts`
> - `src/api/schemas/review.ts`

## 1. Problem

Ringi currently has three incompatible truths about review state:

1. `docs/ARCHITECTURE.md §14` defines a target lifecycle: `created → analyzing → ready → in_review → approved | changes_requested → exported`.
2. `docs/CLI.md` exposes only `in_progress | approved | changes_requested`.
3. The running implementation persists one mutable `reviews.status` column and exposes generic `update(id, status)` mutations in both `ReviewService` and `ReviewRepo`.

That mismatch violates the architecture in concrete ways:

- `ARCHITECTURE §7`: all runtimes must share one review model.
- `ARCHITECTURE §9`: Review owns comments, suggestions, status transitions, and snapshot anchoring.
- `ARCHITECTURE §11`: persistence happens before analysis is exposed; exports must be reproducible from stored snapshot inputs plus persisted annotations.
- `ARCHITECTURE §14`: the single `status` column is explicitly called out as too coarse.

This spec replaces the coarse model with a formal state machine, exact Effect contracts, exact DDL, exact migration steps, and exact implementation tasks.

## 2. Verified Current State

### 2.1 Current persisted schema

Verified in `src/routes/api/-lib/db/migrations.ts`.

```sql
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  repository_path TEXT NOT NULL,
  base_ref TEXT,
  snapshot_data TEXT NOT NULL,
  status TEXT DEFAULT 'in_progress',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
) STRICT;
```

Observed facts:

- `reviews.status` has no `CHECK` constraint.
- `workflow_state`, `review_decision`, `exported_at`, and `row_version` do not exist.
- there is no export persistence table.
- `source_type` / `source_ref` were added later without `NOT NULL` / `CHECK` guarantees.

### 2.2 Current schema contract

Verified in `src/api/schemas/review.ts`.

```ts
export const ReviewStatus = Schema.Literal(
  "in_progress",
  "approved",
  "changes_requested"
);

export const Review = Schema.Struct({
  baseRef: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  id: ReviewId,
  repositoryPath: Schema.String,
  snapshotData: Schema.String,
  sourceRef: Schema.NullOr(Schema.String),
  sourceType: ReviewSourceType,
  status: ReviewStatus,
  updatedAt: Schema.String,
});

export const UpdateReviewInput = Schema.Struct({
  status: Schema.optionalWith(ReviewStatus, { as: "Option" }),
});
```

Observed facts:

- lifecycle is encoded as a single status field.
- `snapshotData` is opaque JSON text.
- no derived lifecycle projection exists.

### 2.3 Exact current behavior of `ReviewService.create()`

Verified in `src/routes/api/-lib/services/review.service.ts`.

Current signature shape:

```ts
create(input: CreateReviewInput): Effect.Effect<Review, ReviewError>
```

Actual steps today:

1. load repository path from `GitService.getRepositoryPath`
2. call `GitService.hasCommits`; if false, fail with `ReviewError{ code: 'NO_COMMITS' }`
3. branch on `input.sourceType`
   - `staged`
     - call `git.getStagedDiff`
     - if empty after trim, fail with `ReviewError{ code: 'NO_STAGED_CHANGES' }`
     - call shell `git rev-parse HEAD` via `getHeadSha(repoPath)` and store it in `baseRef`
   - `branch`
     - require `sourceRef`
     - call `git.getBranchDiff(sourceRef)`
     - store `baseRef = sourceRef`
   - `commits`
     - require `sourceRef`
     - split comma-separated SHAs
     - reject zero valid SHAs with `ReviewError{ code: 'INVALID_SOURCE' }`
     - call `git.getCommitDiff(shas)`
     - store `baseRef = shas.at(-1)`
4. call `parseDiff(diffText)`
5. if zero files, fail with `ReviewError{ code: 'NO_CHANGES' }`
6. call `git.getRepositoryInfo`
7. generate `reviewId`
8. set `storeHunks = sourceType === 'staged'`
9. build `review_files` inputs; branch and commits store `hunksData = null`
10. build `snapshotData = JSON.stringify({ repository: repoInfo, version: 2 })`
11. call `ReviewRepo.create(...)` with `status: 'in_progress'`
12. call `ReviewFileRepo.createBulk(fileInputs)`
13. return the row inserted in step 11

Critical verified defects:

- the operation is not atomic across `reviews` and `review_files`
- branch and commits reviews do not persist hunks at creation time
- the persisted state immediately collapses `created|analyzing|ready|in_review` into `in_progress`
- `snapshot_data` v2 stores repository metadata only; it does not store source anchors or diff summary

### 2.4 Exact current behavior of `ReviewService.getFileHunks()`

Verified in `src/routes/api/-lib/services/review.service.ts`.

```ts
getFileHunks(reviewId: ReviewId, filePath: string): Effect.Effect<readonly DiffHunk[], ReviewNotFound>
```

Actual behavior today:

1. load the review
2. if `review_files.hunks_data` exists, parse and return it
3. else, if the review source is `branch`, re-run `git.getBranchDiff(review.sourceRef)` and parse live git state
4. else, if the review source is `commits`, re-run `git.getCommitDiff(shas)` and parse live git state
5. else, if legacy `snapshot.files` exists, return hunks from there
6. else return `[]`

This is architecturally wrong for branch/commits reviews because the result changes when refs move.

### 2.5 Exact current comment/suggestion behavior

Verified in `src/routes/api/-lib/services/comment.service.ts` and `src/routes/api/-lib/repos/comment.repo.ts`.

```ts
create(reviewId: ReviewId, input: CreateCommentInput)
resolve(id: CommentId)
unresolve(id: CommentId)
update(id: CommentId, input: UpdateCommentInput)
```

Observed facts:

- `suggestion` is a nullable column on `comments`; there is no separate suggestions table.
- `resolve()` and `unresolve()` only toggle `comments.resolved`.
- comment mutations do not reopen approved reviews.
- there is no bulk resolve API.

### 2.6 Exact current export behavior

Verified in `src/routes/api/-lib/services/export.service.ts`.

```ts
exportReview(reviewId: ReviewId): Effect.Effect<string, ReviewNotFound>
```

Actual behavior today:

1. load review detail from `ReviewService.getById(reviewId)`
2. load comments and todo list
3. render markdown in memory
4. render `review.status` in the header
5. return the markdown string

Observed facts:

- export does not persist any audit row
- export does not set lifecycle state
- export is allowed with no explicit review decision

## 3. Design Decisions

### DD-1 — Split operational progress, verdict, and export fact

**Decision**

Persist lifecycle as four fields on `reviews`:

- `workflow_state`
- `review_decision`
- `exported_at`
- `row_version`

Derive `lifecycle_state` on reads.

**Rationale**

One mutable `status` field cannot truthfully answer three different questions:

- Is the snapshot capture complete?
- What is the reviewer verdict?
- Has an export been recorded?

**Alternatives considered**

| Alternative                                              | Why rejected                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Expand `status` enum only                                | Still conflates progress, verdict, and export                                  |
| Keep `status` + `exported` boolean                       | Still cannot distinguish `ready` vs `in_review`; boolean loses timestamp truth |
| Split `workflow_state`, `review_decision`, `exported_at` | Chosen                                                                         |

**Consequences**

- generic `update(id, status)` must be deleted
- adapters must call explicit lifecycle operations only
- list/show/export responses must expose derived lifecycle, not legacy status

### DD-2 — Review snapshots are immutable and self-sufficient

**Decision**

Persist hunks for `staged`, `branch`, and `commits` reviews at creation time. `getFileHunks()` must stop consulting live git state for reviews created after this cutover.

**Rationale**

Architecture §11 says exports are reproducible from stored snapshot inputs. Re-diffing live git is the opposite.

**Alternatives considered**

| Alternative                             | Why rejected                           |
| --------------------------------------- | -------------------------------------- |
| Persist hunks only for `staged`         | branch/commits become non-reproducible |
| Recompute hunks lazily from stored refs | refs move or disappear                 |
| Persist hunks for every source          | Chosen                                 |

**Consequences**

- `review_files.hunks_data` becomes required for all new reviews
- legacy rows without hunks must be marked as degraded, not silently treated as perfect

### DD-3 — Suggestions remain comment-owned

**Decision**

Do not introduce a separate suggestions table in this cutover. Suggestions remain `comments.suggestion` and follow comment lifecycle rules.

**Rationale**

The current code already models suggestions that way. Introducing a second representation would create design drift during a lifecycle refactor.

**Alternatives considered**

| Alternative                           | Why rejected                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| Add a new `suggestions` table now     | Solves no current lifecycle bug and creates dual representations during cutover |
| Keep suggestions embedded in comments | Chosen                                                                          |

**Consequences**

- “suggestion created” means `CommentService.create/update` produced a comment with `suggestion != null`
- there is no independent suggestion resolution state

### DD-4 — Approved reviews reopen when new unresolved work appears

**Decision**

The following events must clear `review_decision` and return the derived lifecycle to `in_review` in the same transaction when the review is currently approved:

- `CommentService.create(...)`
- `CommentService.unresolve(...)`
- `TodoService.create({ reviewId })`
- `TodoService.update/toggle(...)` when a review-linked todo becomes incomplete again
- explicit `ReviewService.reopen(...)`

**Rationale**

An approved review with new unresolved work is a lie.

**Alternatives considered**

| Alternative                                     | Why rejected                                                |
| ----------------------------------------------- | ----------------------------------------------------------- |
| Keep approval sticky until a human clears it    | Leaves a false approved state visible to every runtime      |
| Reopen only for comments, not todos             | Review-linked todos are review work and must not be ignored |
| Reopen on any new unresolved review-scoped work | Chosen                                                      |

**Consequences**

- lifecycle-affecting child mutations must join the review CAS transaction
- approval remains revisable before export, but never after export

### DD-5 — Exported is terminal; first successful export wins

**Decision**

The first successful export:

1. inserts an audit row into `review_exports`
2. sets `reviews.exported_at`
3. increments `reviews.row_version`

After that, all review/comment/todo/lifecycle mutations fail with `ReviewAlreadyExported` or `ReviewLifecycleGuardFailed`.

**Rationale**

An exported snapshot is an audit boundary. Post-export mutation would falsify the artifact.

**Alternatives considered**

| Alternative                                             | Why rejected                                        |
| ------------------------------------------------------- | --------------------------------------------------- |
| Allow mutation after export                             | Makes the exported artifact untrustworthy           |
| Allow repeated exports to overwrite `exported_at`       | Destroys first-export truth and weakens idempotency |
| First successful export wins and terminals the snapshot | Chosen                                              |

**Consequences**

- export becomes idempotent at the lifecycle layer: later attempts do not mutate state
- exported review cleanup remains an explicit destructive admin action, not a lifecycle transition

### DD-6 — Lifecycle writes use optimistic concurrency plus `BEGIN IMMEDIATE`

**Decision**

Every lifecycle-affecting write must run inside an immediate SQLite transaction and perform compare-and-set on `reviews.row_version`.

**Rationale**

Ringi has multiple runtimes. “Usually one writer” is not a contract.

**Alternatives considered**

| Alternative                              | Why rejected                                                |
| ---------------------------------------- | ----------------------------------------------------------- |
| Trust process discipline only            | Not enforceable at the persistence layer                    |
| Use transactions without row versions    | Cannot distinguish stale caller intent from generic failure |
| `BEGIN IMMEDIATE` + CAS on `row_version` | Chosen                                                      |

**Consequences**

- add `withImmediateTransaction(...)` in `src/routes/api/-lib/db/database.ts`
- stale callers must get a tagged conflict error, not a generic failure
- in-flight export vs comment/todo/lifecycle races become deterministic and testable

## 4. Canonical Contracts

### 4.1 Effect Schema types

File target: `src/api/schemas/review.ts`

```ts
import * as HttpApiSchema from "@effect/platform/HttpApiSchema";
import * as Schema from "effect/Schema";

export const ReviewId = Schema.String.pipe(Schema.brand("ReviewId"));
export type ReviewId = typeof ReviewId.Type;

export const ReviewSourceType = Schema.Literal("staged", "branch", "commits");
export type ReviewSourceType = typeof ReviewSourceType.Type;

export const ReviewWorkflowState = Schema.Literal(
  "created",
  "analyzing",
  "ready",
  "in_review"
);
export type ReviewWorkflowState = typeof ReviewWorkflowState.Type;

export const ReviewDecision = Schema.Literal("approved", "changes_requested");
export type ReviewDecision = typeof ReviewDecision.Type;

export const ReviewLifecycleState = Schema.Literal(
  "created",
  "analyzing",
  "ready",
  "in_review",
  "approved",
  "changes_requested",
  "exported"
);
export type ReviewLifecycleState = typeof ReviewLifecycleState.Type;

export const SnapshotCaptureIntegrity = Schema.Literal(
  "complete",
  "legacy_partial"
);
export type SnapshotCaptureIntegrity = typeof SnapshotCaptureIntegrity.Type;

export const SnapshotIntegrityReason = Schema.Literal(
  "legacy_missing_base_sha",
  "legacy_missing_head_sha",
  "legacy_missing_hunks",
  "legacy_unknown_status"
);
export type SnapshotIntegrityReason = typeof SnapshotIntegrityReason.Type;

export const ReviewSnapshotData = Schema.Struct({
  version: Schema.Literal(3),
  repository: Schema.Struct({
    name: Schema.String,
    branch: Schema.String,
  }),
  source: Schema.Struct({
    type: ReviewSourceType,
    sourceRef: Schema.NullOr(Schema.String),
    baseRef: Schema.NullOr(Schema.String),
    baseSha: Schema.NullOr(Schema.String),
    headRef: Schema.NullOr(Schema.String),
    headSha: Schema.NullOr(Schema.String),
    capturedAt: Schema.String,
  }),
  diffSummary: Schema.Struct({
    files: Schema.Number,
    additions: Schema.Number,
    deletions: Schema.Number,
  }),
  integrity: Schema.Struct({
    captureIntegrity: SnapshotCaptureIntegrity,
    reasons: Schema.Array(SnapshotIntegrityReason),
  }),
});
export type ReviewSnapshotData = typeof ReviewSnapshotData.Type;

export const Review = Schema.Struct({
  id: ReviewId,
  repositoryPath: Schema.String,
  baseRef: Schema.NullOr(Schema.String),
  sourceType: ReviewSourceType,
  sourceRef: Schema.NullOr(Schema.String),
  snapshotData: ReviewSnapshotData,
  workflowState: ReviewWorkflowState,
  reviewDecision: Schema.NullOr(ReviewDecision),
  lifecycleState: ReviewLifecycleState,
  exportedAt: Schema.NullOr(Schema.String),
  rowVersion: Schema.Number,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type Review = typeof Review.Type;
```

### 4.2 Derived lifecycle projection

```ts
export const deriveLifecycleState = (row: {
  workflowState: ReviewWorkflowState;
  reviewDecision: ReviewDecision | null;
  exportedAt: string | null;
}): ReviewLifecycleState => {
  if (row.exportedAt !== null) return "exported";
  if (row.reviewDecision === "approved") return "approved";
  if (row.reviewDecision === "changes_requested") return "changes_requested";
  return row.workflowState;
};
```

### 4.3 Exhaustive error types

File targets:

- `src/api/schemas/review.ts`
- `src/api/schemas/comment.ts`
- new file `src/api/schemas/export.ts` if export-specific errors are split out

```ts
export class ReviewNotFound extends Schema.TaggedError<ReviewNotFound>()(
  "ReviewNotFound",
  { id: ReviewId },
  HttpApiSchema.annotations({ status: 404 })
) {}

export class ReviewSourceInvalid extends Schema.TaggedError<ReviewSourceInvalid>()(
  "ReviewSourceInvalid",
  {
    sourceType: ReviewSourceType,
    sourceRef: Schema.NullOr(Schema.String),
    reason: Schema.String,
  },
  HttpApiSchema.annotations({ status: 400 })
) {}

export class ReviewRepositoryHasNoCommits extends Schema.TaggedError<ReviewRepositoryHasNoCommits>()(
  "ReviewRepositoryHasNoCommits",
  {},
  HttpApiSchema.annotations({ status: 400 })
) {}

export class ReviewDiffEmpty extends Schema.TaggedError<ReviewDiffEmpty>()(
  "ReviewDiffEmpty",
  { sourceType: ReviewSourceType },
  HttpApiSchema.annotations({ status: 400 })
) {}

export class ReviewPersistenceFailed extends Schema.TaggedError<ReviewPersistenceFailed>()(
  "ReviewPersistenceFailed",
  { operation: Schema.String, reason: Schema.String },
  HttpApiSchema.annotations({ status: 500 })
) {}

export class ReviewLifecycleGuardFailed extends Schema.TaggedError<ReviewLifecycleGuardFailed>()(
  "ReviewLifecycleGuardFailed",
  { reviewId: ReviewId, transition: Schema.String, reason: Schema.String },
  HttpApiSchema.annotations({ status: 409 })
) {}

export class ReviewTransitionConflict extends Schema.TaggedError<ReviewTransitionConflict>()(
  "ReviewTransitionConflict",
  {
    reviewId: ReviewId,
    expectedRowVersion: Schema.Number,
    actualRowVersion: Schema.Number,
  },
  HttpApiSchema.annotations({ status: 409 })
) {}

export class ReviewAlreadyExported extends Schema.TaggedError<ReviewAlreadyExported>()(
  "ReviewAlreadyExported",
  { reviewId: ReviewId, exportedAt: Schema.String },
  HttpApiSchema.annotations({ status: 409 })
) {}

export class ReviewDecisionRequiredForExport extends Schema.TaggedError<ReviewDecisionRequiredForExport>()(
  "ReviewDecisionRequiredForExport",
  { reviewId: ReviewId },
  HttpApiSchema.annotations({ status: 409 })
) {}

export class ReviewLifecycleMigrationUnexpectedStatus extends Schema.TaggedError<ReviewLifecycleMigrationUnexpectedStatus>()(
  "ReviewLifecycleMigrationUnexpectedStatus",
  { reviewId: ReviewId, status: Schema.String },
  HttpApiSchema.annotations({ status: 500 })
) {}
```

## 5. Formal State Machine

### 5.1 Transition table

| From                | To                  | Triggering service method                                                                                                            | Guards that MUST pass                                                       | Postconditions                                                                                                   |
| ------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| none                | `created`           | `ReviewService.create()`                                                                                                             | source resolves; repo has commits; diff non-empty                           | review row inserted with `workflow_state='created'`, `review_decision=NULL`, `exported_at=NULL`, `row_version=0` |
| `created`           | `analyzing`         | `ReviewService.create()` internal step                                                                                               | parsed files available                                                      | row updated to `workflow_state='analyzing'` before `review_files` insert                                         |
| `analyzing`         | `ready`             | `ReviewService.create()` internal step                                                                                               | all `review_files` inserted; snapshot JSON v3 built                         | row updated to `workflow_state='ready'`; all hunks stored                                                        |
| `ready`             | `in_review`         | `ReviewService.startReview()`; `CommentService.create()`; `TodoService.create()`                                                     | `exported_at IS NULL`                                                       | `workflow_state='in_review'`; `row_version+1`                                                                    |
| `in_review`         | `approved`          | `ReviewService.approve()`; `CommentService.resolveAllForReview()`                                                                    | `exported_at IS NULL`; unresolved comments count = 0 after any bulk resolve | `review_decision='approved'`; `workflow_state='in_review'`; `row_version+1`                                      |
| `in_review`         | `changes_requested` | `ReviewService.requestChanges()`                                                                                                     | `exported_at IS NULL`                                                       | `review_decision='changes_requested'`; `row_version+1`                                                           |
| `approved`          | `in_review`         | `ReviewService.reopen()`; `CommentService.create()`; `CommentService.unresolve()`; `TodoService.create()`; review-linked todo reopen | `exported_at IS NULL`                                                       | `review_decision=NULL`; `workflow_state='in_review'`; `row_version+1`                                            |
| `changes_requested` | `in_review`         | `ReviewService.reopen()`                                                                                                             | `exported_at IS NULL`                                                       | `review_decision=NULL`; `workflow_state='in_review'`; `row_version+1`                                            |
| `approved`          | `changes_requested` | `ReviewService.requestChanges()`                                                                                                     | `exported_at IS NULL`                                                       | verdict flips on same immutable snapshot                                                                         |
| `changes_requested` | `approved`          | `ReviewService.approve()`                                                                                                            | `exported_at IS NULL`; unresolved comments count = 0                        | verdict flips on same immutable snapshot                                                                         |
| `approved`          | `exported`          | `ExportService.exportReview()` -> `ReviewService.recordExport()`                                                                     | `exported_at IS NULL`                                                       | `review_exports` row inserted; `exported_at` set once                                                            |
| `changes_requested` | `exported`          | `ExportService.exportReview()` -> `ReviewService.recordExport()`                                                                     | `exported_at IS NULL`                                                       | rejected snapshot exported as audit artifact                                                                     |

### 5.2 Prohibited transitions

- any `exported -> *`
- `ready -> approved` without `ReviewService.approve()`
- `ready -> changes_requested` without `ReviewService.requestChanges()`
- any mutation that silently preserves `approved` after new unresolved work is introduced
- any lifecycle transition based on live git recomputation of branch/commit hunks

## 6. Child Entity Rules

### 6.1 Comments and suggestions

| Entity     | Current representation              | Target rule                                                                                                    |
| ---------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Comment    | `comments` row                      | lifecycle-affecting write when created, unresolved, bulk-resolved, or removed from bulk-approval consideration |
| Suggestion | `comments.suggestion` nullable text | follows comment lifecycle exactly; no separate table in this cutover                                           |

Rules:

- resolving one comment does not auto-approve a review
- unresolving one comment on an approved review reopens it in the same transaction
- creating a comment on an approved review reopens it in the same transaction
- `ringi review resolve <id>` remains explicit approval, not inferred approval

### 6.2 Todos

| Operation                        | Target lifecycle effect             |
| -------------------------------- | ----------------------------------- |
| create linked todo on `ready`    | start review (`ready -> in_review`) |
| create linked todo on `approved` | reopen (`approved -> in_review`)    |
| reopen linked todo on `approved` | reopen (`approved -> in_review`)    |
| complete todo                    | no lifecycle transition by itself   |
| remove todo                      | no lifecycle transition by itself   |

### 6.3 Review files

| Rule                           | Requirement                                   |
| ------------------------------ | --------------------------------------------- |
| add/remove after creation      | forbidden                                     |
| mutate hunks after creation    | forbidden                                     |
| delete behavior                | only via parent review delete cascade         |
| source of truth for file hunks | `review_files.hunks_data` for all new reviews |

### 6.4 Exports

Add explicit export persistence.

New child entity:

```sql
CREATE TABLE review_exports (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  format TEXT NOT NULL CHECK (format IN ('markdown')),
  destination TEXT NOT NULL CHECK (destination IN ('stdout', 'file')),
  output_path TEXT,
  content_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;
```

Rules:

- first successful export inserts exactly one row and sets `reviews.exported_at`
- repeated export attempts return `ReviewAlreadyExported`; they do not insert a second row
- export requires explicit decision: `approved` or `changes_requested`
- export of `changes_requested` is allowed and must preserve that verdict in metadata

## 7. In-Flight Operations and Concurrency

### 7.1 Compare-and-set protocol

Every lifecycle-affecting write MUST follow this exact protocol:

1. `BEGIN IMMEDIATE`
2. load review row by id
3. if missing, fail with `ReviewNotFound`
4. if `exported_at IS NOT NULL`, fail with `ReviewAlreadyExported`
5. validate transition-specific guards
6. perform `UPDATE reviews ... WHERE id = ? AND row_version = ?`
7. if `changes = 0`, reload row and fail with `ReviewTransitionConflict`
8. apply child-row changes in the same transaction
9. `COMMIT`

### 7.2 Concurrent operation outcomes

| Concurrent pair                 | Required outcome                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| approve vs request-changes      | exactly one CAS succeeds; loser gets `ReviewTransitionConflict`                                                    |
| unresolve comment vs approve    | approval counts unresolved comments inside the same transaction and must fail if the unresolve won first           |
| create comment vs export        | exactly one wins the immediate transaction; if export commits first, comment write fails with terminal-state error |
| bulk resolve vs request-changes | exactly one verdict wins; loser reloads                                                                            |
| todo reopen vs export           | export after reopen must see `review_decision=NULL` and fail with `ReviewDecisionRequiredForExport`                |

### 7.3 Event rate / batching

Lifecycle events are not debounced. Every successful lifecycle mutation emits immediately.

Exception:

- `CommentService.resolveAllForReview()` emits one review lifecycle event and one bulk comment summary event, not N individual lifecycle events.

## 8. Target Persistence Schema

### 8.1 Target `reviews` table

Because SQLite cannot safely add all needed constraints and remove legacy ambiguity in-place, rebuild the table.

```sql
CREATE TABLE reviews_v2 (
  id TEXT PRIMARY KEY,
  repository_path TEXT NOT NULL,
  base_ref TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('staged', 'branch', 'commits')),
  source_ref TEXT,
  snapshot_data TEXT NOT NULL,
  workflow_state TEXT NOT NULL DEFAULT 'created' CHECK (workflow_state IN ('created', 'analyzing', 'ready', 'in_review')),
  review_decision TEXT CHECK (review_decision IN ('approved', 'changes_requested')),
  exported_at TEXT,
  row_version INTEGER NOT NULL DEFAULT 0 CHECK (row_version >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;
```

### 8.2 Unchanged child tables, now with explicit lifecycle assumptions

```sql
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  line_number INTEGER,
  line_type TEXT,
  content TEXT NOT NULL,
  suggestion TEXT,
  resolved INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

CREATE TABLE todos (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  review_id TEXT REFERENCES reviews(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

CREATE TABLE review_files (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  old_path TEXT,
  status TEXT NOT NULL,
  additions INTEGER NOT NULL DEFAULT 0,
  deletions INTEGER NOT NULL DEFAULT 0,
  hunks_data TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;
```

### 8.3 Required indexes

```sql
CREATE INDEX idx_reviews_repo_workflow_created
  ON reviews(repository_path, workflow_state, created_at DESC);

CREATE INDEX idx_reviews_repo_decision_created
  ON reviews(repository_path, review_decision, created_at DESC);

CREATE INDEX idx_reviews_repo_exported_created
  ON reviews(repository_path, exported_at, created_at DESC);

CREATE INDEX idx_comments_review_resolved
  ON comments(review_id, resolved);

CREATE UNIQUE INDEX idx_review_exports_review_id
  ON review_exports(review_id);
```

## 9. Migration Strategy

File target: `src/routes/api/-lib/db/migrations.ts`

### 9.1 Preflight: reject unexpected legacy statuses

The migration MUST fail before any destructive step if legacy data contains unknown statuses.

```sql
SELECT id, status
FROM reviews
WHERE status IS NOT NULL
  AND status NOT IN ('in_progress', 'approved', 'changes_requested');
```

If any row is returned, abort migration and surface `ReviewLifecycleMigrationUnexpectedStatus` per row. Do not guess.

### 9.2 Main migration SQL

```sql
BEGIN IMMEDIATE;

CREATE TABLE reviews_v2 (
  id TEXT PRIMARY KEY,
  repository_path TEXT NOT NULL,
  base_ref TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('staged', 'branch', 'commits')),
  source_ref TEXT,
  snapshot_data TEXT NOT NULL,
  workflow_state TEXT NOT NULL DEFAULT 'created' CHECK (workflow_state IN ('created', 'analyzing', 'ready', 'in_review')),
  review_decision TEXT CHECK (review_decision IN ('approved', 'changes_requested')),
  exported_at TEXT,
  row_version INTEGER NOT NULL DEFAULT 0 CHECK (row_version >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

INSERT INTO reviews_v2 (
  id,
  repository_path,
  base_ref,
  source_type,
  source_ref,
  snapshot_data,
  workflow_state,
  review_decision,
  exported_at,
  row_version,
  created_at,
  updated_at
)
SELECT
  id,
  repository_path,
  base_ref,
  COALESCE(source_type, 'staged') AS source_type,
  source_ref,
  snapshot_data,
  CASE
    WHEN status IN ('approved', 'changes_requested') THEN 'in_review'
    WHEN EXISTS (SELECT 1 FROM comments c WHERE c.review_id = reviews.id)
      OR EXISTS (SELECT 1 FROM todos t WHERE t.review_id = reviews.id)
    THEN 'in_review'
    ELSE 'ready'
  END AS workflow_state,
  CASE
    WHEN status = 'approved' THEN 'approved'
    WHEN status = 'changes_requested' THEN 'changes_requested'
    ELSE NULL
  END AS review_decision,
  NULL AS exported_at,
  0 AS row_version,
  created_at,
  updated_at
FROM reviews;

DROP TABLE reviews;
ALTER TABLE reviews_v2 RENAME TO reviews;

CREATE INDEX idx_reviews_repo_workflow_created
  ON reviews(repository_path, workflow_state, created_at DESC);
CREATE INDEX idx_reviews_repo_decision_created
  ON reviews(repository_path, review_decision, created_at DESC);
CREATE INDEX idx_reviews_repo_exported_created
  ON reviews(repository_path, exported_at, created_at DESC);
CREATE INDEX idx_comments_review_resolved
  ON comments(review_id, resolved);

CREATE TABLE review_exports (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  format TEXT NOT NULL CHECK (format IN ('markdown')),
  destination TEXT NOT NULL CHECK (destination IN ('stdout', 'file')),
  output_path TEXT,
  content_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;
CREATE UNIQUE INDEX idx_review_exports_review_id ON review_exports(review_id);

COMMIT;
```

### 9.3 `snapshot_data` v2 → v3 backfill

File target: `src/routes/api/-lib/services/review.service.ts` or a dedicated migration helper called from migrations.

Target rules:

- all rows must read as v3 after cutover
- if historical data cannot reconstruct exact base/head or hunks, mark integrity as `legacy_partial`
- do not invent missing SHAs

Target v3 shape:

```json
{
  "version": 3,
  "repository": { "name": "string", "branch": "string" },
  "source": {
    "type": "staged | branch | commits",
    "sourceRef": "string | null",
    "baseRef": "string | null",
    "baseSha": "string | null",
    "headRef": "string | null",
    "headSha": "string | null",
    "capturedAt": "ISO-8601"
  },
  "diffSummary": { "files": 0, "additions": 0, "deletions": 0 },
  "integrity": {
    "captureIntegrity": "complete | legacy_partial",
    "reasons": []
  }
}
```

Backfill rules:

- derive `diffSummary` from `review_files`
- preserve `repository` from v2 if present
- set `source.type = reviews.source_type`
- set `source.sourceRef = reviews.source_ref`
- set `source.baseRef = reviews.base_ref`
- set `source.baseSha/headSha/headRef = null` when historical data is unavailable
- if any of those are unavailable, append matching `integrity.reasons`
- if any branch/commits review lacks stored hunks, append `legacy_missing_hunks`

## 10. Service and Repository Cutover

### 10.1 `src/routes/api/-lib/repos/review.repo.ts`

**Current code**

```ts
create(input: {..., status: string}): Effect.Effect<Review>
update(id: ReviewId, status: string | null): Effect.Effect<Review | null>
findAll(opts: { status?: string ... }): Effect.Effect<{ data: readonly Review[]; total: number }>
```

**Target code**

```ts
findById(id: ReviewId): Effect.Effect<Review | null, never>
findAll(opts: {
  repositoryPath?: string;
  sourceType?: ReviewSourceType;
  lifecycleState?: ReviewLifecycleState | "in_progress";
  page?: number;
  pageSize?: number;
}): Effect.Effect<{ data: readonly Review[]; total: number }, never>

createSnapshot(input: CreateReviewSnapshotRow): Effect.Effect<Review, ReviewPersistenceFailed>
transitionLifecycle(input: TransitionReviewLifecycleInput): Effect.Effect<Review, ReviewNotFound | ReviewTransitionConflict | ReviewLifecycleGuardFailed>
recordExport(input: RecordExportRowInput): Effect.Effect<Review, ReviewNotFound | ReviewTransitionConflict | ReviewAlreadyExported | ReviewPersistenceFailed>
```

**Required diff**

- delete `update(id, status)`
- stop selecting/mapping `status`
- map `snapshot_data` into v3 schema and derive `lifecycleState`
- add CAS update helpers

**Test criteria**

- stale `expectedRowVersion` returns `ReviewTransitionConflict`
- invalid transition returns `ReviewLifecycleGuardFailed`
- `findAll({ lifecycleState: 'in_progress' })` maps to `review_decision IS NULL AND exported_at IS NULL`

### 10.2 `src/routes/api/-lib/services/review.service.ts`

**Current code**

```ts
create(input: CreateReviewInput)
getFileHunks(reviewId: ReviewId, filePath: string)
update(id: ReviewId, input: UpdateReviewInput)
getStats
```

**Target code**

```ts
create(input: CreateReviewInput): Effect.Effect<Review, ReviewSourceInvalid | ReviewRepositoryHasNoCommits | ReviewDiffEmpty | ReviewPersistenceFailed>
startReview(input: StartReviewInput): Effect.Effect<Review, ReviewNotFound | ReviewTransitionConflict | ReviewAlreadyExported | ReviewLifecycleGuardFailed>
approve(input: ApproveReviewInput): Effect.Effect<Review, ReviewNotFound | ReviewTransitionConflict | ReviewAlreadyExported | ReviewLifecycleGuardFailed>
requestChanges(input: RequestChangesInput): Effect.Effect<Review, ReviewNotFound | ReviewTransitionConflict | ReviewAlreadyExported | ReviewLifecycleGuardFailed>
reopen(input: ReopenReviewInput): Effect.Effect<Review, ReviewNotFound | ReviewTransitionConflict | ReviewAlreadyExported | ReviewLifecycleGuardFailed>
recordExport(input: RecordExportInput): Effect.Effect<Review, ReviewNotFound | ReviewTransitionConflict | ReviewAlreadyExported | ReviewDecisionRequiredForExport | ReviewPersistenceFailed>
getFileHunks(reviewId: ReviewId, filePath: string): Effect.Effect<readonly DiffHunk[], ReviewNotFound>
```

**Required diff**

- delete `update(...)`
- make `create(...)` atomic across review row + file rows + lifecycle transitions
- persist hunks for all source types
- emit v3 snapshot data
- stop consulting live git state in `getFileHunks(...)` for new rows

**Test criteria**

- failed file insert leaves no review row behind
- branch review remains exportable after branch ref moves
- commit review remains readable after commit range disappears from current refs

### 10.3 `src/routes/api/-lib/services/comment.service.ts`

**Current code**

```ts
create(...)
resolve(id)
unresolve(id)
```

**Target code**

```ts
create(reviewId: ReviewId, input: CreateCommentInput): Effect.Effect<Comment, CommentNotFound | ReviewNotFound | ReviewAlreadyExported | ReviewTransitionConflict | ReviewLifecycleGuardFailed>
resolve(id: CommentId): Effect.Effect<Comment, CommentNotFound | ReviewAlreadyExported>
unresolve(id: CommentId): Effect.Effect<Comment, CommentNotFound | ReviewNotFound | ReviewAlreadyExported | ReviewTransitionConflict | ReviewLifecycleGuardFailed>
resolveAllForReview(input: { reviewId: ReviewId; expectedReviewRowVersion: number }): Effect.Effect<{ resolvedCount: number; review: Review }, ReviewNotFound | ReviewAlreadyExported | ReviewTransitionConflict | ReviewLifecycleGuardFailed>
```

**Required diff**

- add bulk resolve
- reopen approved reviews on `create(...)` and `unresolve(...)`
- treat suggestions as comment lifecycle participants

**Test criteria**

- creating a comment on approved review reopens it in one transaction
- unresolving a comment on approved review reopens it in one transaction
- bulk resolve updates all unresolved comments and approves review atomically

### 10.4 `src/routes/api/-lib/services/export.service.ts`

**Current code**

```ts
exportReview(reviewId: ReviewId): Effect.Effect<string, ReviewNotFound>
```

**Target code**

```ts
exportReview(input: {
  reviewId: ReviewId;
  destination: "stdout" | "file";
  outputPath: string | null;
}): Effect.Effect<{
  markdown: string;
  review: Review;
  exportId: string;
}, ReviewNotFound | ReviewAlreadyExported | ReviewDecisionRequiredForExport | ReviewTransitionConflict | ReviewPersistenceFailed>
```

**Required diff**

- render `review.lifecycleState`, not `review.status`
- reject export when `reviewDecision === null`
- insert `review_exports` row and set `reviews.exported_at`

**Test criteria**

- exporting approved review sets `exported_at` once
- exporting changes-requested review succeeds and preserves verdict metadata
- second export attempt returns `ReviewAlreadyExported`

### 10.5 Full method diff matrix

This matrix closes the gap between the current code and the target contract for every currently exposed service method.

| File                 | Current method | Target disposition     | Target behavior                                                                                              |
| -------------------- | -------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `review.service.ts`  | `create`       | changed                | atomic create; v3 snapshot; explicit internal `created -> analyzing -> ready`; persist hunks for all sources |
| `review.service.ts`  | `list`         | changed                | return canonical lifecycle fields; accept legacy `in_progress` as request alias only                         |
| `review.service.ts`  | `getById`      | changed                | return canonical lifecycle fields and v3 snapshot data                                                       |
| `review.service.ts`  | `getFileHunks` | changed                | read persisted hunks only for new rows; no live git fallback                                                 |
| `review.service.ts`  | `update`       | deleted                | replaced by `startReview`, `approve`, `requestChanges`, `reopen`, `recordExport`                             |
| `review.service.ts`  | `remove`       | unchanged semantically | destructive admin delete; cascades child rows including `review_exports`                                     |
| `review.service.ts`  | `getStats`     | changed                | compute counts from canonical lifecycle fields, not legacy status                                            |
| `comment.service.ts` | `create`       | changed                | may start or reopen review lifecycle transactionally                                                         |
| `comment.service.ts` | `getById`      | unchanged              | read-only                                                                                                    |
| `comment.service.ts` | `getByReview`  | unchanged              | read-only                                                                                                    |
| `comment.service.ts` | `getByFile`    | unchanged              | read-only                                                                                                    |
| `comment.service.ts` | `update`       | changed                | if updating an annotation on an approved review, reopen transactionally before commit                        |
| `comment.service.ts` | `resolve`      | changed                | reject after export; otherwise resolve only, no auto-approve                                                 |
| `comment.service.ts` | `unresolve`    | changed                | reopen approved review in same transaction                                                                   |
| `comment.service.ts` | `remove`       | unchanged              | delete comment; no auto-approval side effect                                                                 |
| `comment.service.ts` | `getStats`     | unchanged              | read-only aggregation                                                                                        |
| `export.service.ts`  | `exportReview` | changed                | require explicit decision; record export row; terminal transition to `exported`                              |

**Test criteria**

- every deleted method has no remaining call sites
- every changed read method returns canonical lifecycle fields
- every changed write method is covered by a lifecycle transition or explicit non-transition rule

## 11. Backward Compatibility and Cutover

### 11.1 Request compatibility

For one cutover window, adapter input filters MAY still accept:

```txt
in_progress
approved
changes_requested
```

Mapping:

- `in_progress` -> `exported_at IS NULL AND review_decision IS NULL`
- `approved` -> `exported_at IS NULL AND review_decision = 'approved'`
- `changes_requested` -> `exported_at IS NULL AND review_decision = 'changes_requested'`

### 11.2 Response compatibility

There is no legacy response alias after cutover. Canonical response shape is:

```ts
{
  id,
  repositoryPath,
  sourceType,
  sourceRef,
  snapshotData,
  workflowState,
  reviewDecision,
  lifecycleState,
  exportedAt,
  rowVersion,
  createdAt,
  updatedAt,
}
```

Reason: response aliases would keep two public truths alive.

## 12. Edge Cases and Expected Behavior

| Case                                   | Expected behavior                                    | Test assertion                                      |
| -------------------------------------- | ---------------------------------------------------- | --------------------------------------------------- |
| repository has no commits              | `create()` fails before insert                       | review count unchanged                              |
| selected source diff is empty          | `create()` fails before insert                       | no review row, no file rows                         |
| branch ref moves after create          | review remains readable/exportable from stored hunks | `getFileHunks()` equals original persisted hunks    |
| commit range becomes unreachable later | review still loads if hunks were stored              | export still succeeds                               |
| approve with unresolved comments       | reject with guard error                              | `reviewDecision` remains `NULL`                     |
| unresolve on approved review           | reopen in same transaction                           | `reviewDecision=NULL`, `lifecycleState='in_review'` |
| create todo on approved review         | reopen in same transaction                           | same as above                                       |
| export with no decision                | reject with `ReviewDecisionRequiredForExport`        | no `review_exports` row                             |
| export after export                    | reject with `ReviewAlreadyExported`                  | `exported_at` unchanged                             |
| unexpected legacy status in migration  | abort migration                                      | original tables untouched                           |

## 13. Rollback Plan

| Step                                    | Rollback strategy                                                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| preflight unexpected statuses           | no changes applied; fix data then rerun                                                                                           |
| create `reviews_v2` and copy            | transaction rollback restores original `reviews`                                                                                  |
| create `review_exports`                 | transaction rollback removes table                                                                                                |
| code cutover                            | revert code and leave migrated schema in place only if no writes occurred under new contract; otherwise restore from DB backup    |
| drop legacy `status` in later migration | only do this after all call sites are cut over and release has baked; rollback is restore-from-backup, not partial schema surgery |

Operational requirement: take a SQLite backup before the migration that rebuilds `reviews`.

## 14. Implementation Tasks

### Task 1 — Review schema cutover

- **Implements**: §§4, 11
- **Files**:
  - `src/api/schemas/review.ts`
- **Change**:
  - replace `ReviewStatus` with `ReviewWorkflowState`, `ReviewDecision`, `ReviewLifecycleState`
  - add structured `ReviewSnapshotData`
  - add exhaustive tagged errors
- **Test criteria**:
  - schema decodes canonical lifecycle rows
  - no exported `status` field remains

### Task 2 — Database migration and export table

- **Implements**: §§8, 9, 13
- **Files**:
  - `src/routes/api/-lib/db/migrations.ts`
  - `src/routes/api/-lib/db/database.ts`
- **Change**:
  - add preflight unexpected-status check
  - rebuild `reviews`
  - add `review_exports`
  - add `withImmediateTransaction(...)`
- **Test criteria**:
  - migration aborts on unexpected status
  - migrated rows derive correct lifecycle
  - rollback on failure leaves original tables intact

### Task 3 — Review repository CAS cutover

- **Implements**: §§5, 7, 10.1
- **Files**:
  - `src/routes/api/-lib/repos/review.repo.ts`
- **Change**:
  - delete `update(id, status)`
  - add `transitionLifecycle(...)`, `recordExport(...)`
  - map filters to canonical lifecycle fields
- **Test criteria**:
  - stale version conflicts are distinct from not found
  - invalid transitions reject with guard error

### Task 4 — Review creation and hunk persistence cutover

- **Implements**: §§3.3, 3.4, 6.3, 10.2
- **Files**:
  - `src/routes/api/-lib/services/review.service.ts`
  - `src/routes/api/-lib/repos/review-file.repo.ts`
- **Change**:
  - make create atomic
  - persist hunks for `branch` and `commits`
  - emit snapshot v3
  - stop live git fallback for new reviews
- **Test criteria**:
  - create failure leaves no partial review
  - branch/commits hunks remain stable after refs move

### Task 5 — Comment lifecycle integration

- **Implements**: §§6.1, 7, 10.3
- **Files**:
  - `src/routes/api/-lib/services/comment.service.ts`
  - `src/routes/api/-lib/repos/comment.repo.ts`
- **Change**:
  - add bulk resolve
  - reopen approved reviews on comment create/unresolve
  - treat suggestion-bearing comments exactly like comments
- **Test criteria**:
  - approved review reopens on new comment
  - approved review reopens on unresolve
  - bulk resolve + approve is atomic

### Task 6 — Todo lifecycle integration

- **Implements**: §§6.2, 7
- **Files**:
  - `src/routes/api/-lib/services/todo.service.ts`
  - `src/routes/api/-lib/repos/todo.repo.ts`
- **Change**:
  - reopen approved reviews on linked todo create/reopen
- **Test criteria**:
  - adding linked todo to approved review reopens it
  - completing todo does not auto-approve or export

### Task 7 — Export lifecycle integration

- **Implements**: §§6.4, 10.4
- **Files**:
  - `src/routes/api/-lib/services/export.service.ts`
  - new repo file for `review_exports` if needed
- **Change**:
  - require explicit decision for export
  - insert export audit row
  - set `exported_at` once
- **Test criteria**:
  - approved export succeeds and terminals the review
  - changes-requested export succeeds and terminals the review
  - repeat export fails cleanly

### Task 8 — Adapter cutover

- **Implements**: §§11, 12
- **Files**:
  - review CLI / HTTP / RPC / MCP adapter files that currently read/write `status`
- **Change**:
  - stop calling generic update
  - keep request-side `in_progress` alias only where needed
  - return canonical lifecycle fields on reads
- **Test criteria**:
  - `ringi review resolve <id>` still works, now via explicit approval path
  - `ringi review list --status in_progress` maps to canonical filter without leaking legacy response fields

## 15. Acceptance Criteria

- `ReviewService` exposes no generic status setter.
- Creating a review from `staged`, `branch`, or `commits` persists enough data to read/export after working tree or refs change.
- `getFileHunks()` for newly created reviews never consults live git state.
- Approved reviews reopen automatically when new unresolved review work appears.
- Export requires explicit verdict and records exactly one terminal export.
- Migration refuses unknown legacy status values instead of guessing.
- All read surfaces derive exact lifecycle states `created|analyzing|ready|in_review|approved|changes_requested|exported` from persisted fields alone.
