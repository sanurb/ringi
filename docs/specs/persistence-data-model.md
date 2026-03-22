# SPEC-005: Persistence and Data Model

## Status

Draft

## Purpose

Define Ringi's canonical persistence contract for the local-first review store under `.ringi/reviews.db`. This spec makes the database shape, migration ordering, repository contracts, WAL concurrency model, and standalone read behavior implementation-ready across CLI, HTTP API, Web UI, and MCP.

This spec exists to close four verified gaps between architecture and implementation:

- the current schema still centers on a coarse `reviews.status` field instead of the split lifecycle fields defined in SPEC-001
- source anchoring and hunk persistence are incomplete for non-staged reviews, violating SPEC-002 snapshot requirements
- standalone CLI reads depend on SQLite behavior that is documented but not yet fully specified as a persistence contract
- the current migration runner is a raw SQL array over `node:sqlite` with `PRAGMA user_version`; it is not ky-sely

## Scope

This spec covers:

- the canonical SQLite schema for review, file, comment, todo, and export persistence
- database-wide configuration required for local-first operation
- migration ordering from the current schema in `src/routes/api/-lib/db/migrations.ts`
- repository-layer responsibilities and limits
- snapshot storage format for `snapshot_data`, file metadata, and serialized hunks
- standalone read behavior for CLI commands that do not require a running server
- optimistic concurrency via `row_version`
- data lifecycle rules for create, update, and delete behavior
- schema versioning via `PRAGMA user_version`

## Non-Goals

This spec does not cover:

- UI rendering contracts for diff, comments, grouped tree, or export output formatting
- MCP namespace method definitions beyond persistence implications already defined in SPEC-004
- intelligence-table schemas for provenance, relationship, group, confidence, or evidence beyond what `docs/ARCHITECTURE.md` names at a directional level
- replacing SQLite with another database engine
- generic ORM portability layers or cross-database abstractions
- backup tooling, sync, replication, or cloud persistence

## Canonical References

- `docs/ARCHITECTURE.md`
  - §8 Core Runtime Model
  - §11 Data Flow
  - §12 Storage and Persistence Strategy
  - §14 Review Model
  - §19 CLI / Server / Web UI / MCP Relationship
  - §20 Security and Local-First Guarantees
  - §24 Failure Modes
  - §25 Migration / Evolution Path
- `docs/CLI.md`
  - Repository Discovery
  - Operational Modes
  - `ringi doctor`
  - `ringi data migrate`
- `docs/specs/review-lifecycle.md` (SPEC-001)
  - split lifecycle fields
  - compare-and-set protocol
  - target `reviews` schema and `review_exports`
  - migration SQL and snapshot v3 backfill rules
- `docs/specs/review-source-ingestion.md` (SPEC-002)
  - immutable source anchoring
  - `review_files` capture metadata additions
  - snapshot anchoring and degraded capture rules
- `docs/specs/cli-surface-contracts.md` (SPEC-003)
  - standalone read-only runtime
  - server-coordinated mutations
  - WAL-backed concurrent reads
- `docs/specs/mcp-execute-api.md` (SPEC-004)
  - readonly rejection before write path
  - shared core-service-backed persistence truth
- `src/routes/api/-lib/db/database.ts`
- `src/routes/api/-lib/db/migrations.ts`
- `src/routes/api/-lib/repos/review.repo.ts`
- `src/routes/api/-lib/repos/review-file.repo.ts`
- `src/routes/api/-lib/repos/comment.repo.ts`
- `src/routes/api/-lib/repos/todo.repo.ts`
- `src/api/schemas/review.ts`

## Terminology

- **Review store** — the SQLite database at `<repo-root>/.ringi/reviews.db`.
- **Canonical schema** — the full set of tables, columns, constraints, indexes, and versioning rules this spec defines.
- **Standalone read path** — in-process, read-only CLI execution over the local SQLite store without a running server.
- **Snapshot anchor** — the persisted review-level and file-level metadata that make a review reproducible without consulting live git state.
- **Lifecycle split fields** — `workflow_state`, `review_decision`, `exported_at`, and `row_version` on `reviews` as defined by SPEC-001.
- **Thin repository** — a persistence component that executes SQL, maps rows, and enforces storage-local invariants only; it does not own business workflow decisions.
- **Schema version** — the integer tracked in `PRAGMA user_version` and advanced by ordered migrations.
- **Capture degradation** — explicit persisted indication that a file snapshot is incomplete, unsupported, or legacy-partial rather than silently missing data.

## Requirements

1. **REQ-005-001 — SQLite is canonical**  
   Ringi SHALL use SQLite in `.ringi/reviews.db` as its only persistence engine for the scope covered by this spec. The persistence layer SHALL target SQLite features directly, including WAL mode, `STRICT` tables, foreign keys, and `PRAGMA user_version`.
2. **REQ-005-002 — No swap-abstraction requirement**  
   Repositories and migrations SHALL optimize for the actual SQLite runtime used in `src/routes/api/-lib/db/database.ts` and SHALL NOT introduce a pretend database-portability layer for this scope.
3. **REQ-005-003 — WAL and foreign keys**  
   Every runtime that opens the review store for normal operation SHALL enable `PRAGMA journal_mode=WAL` and `PRAGMA foreign_keys=ON` before serving requests.
4. **REQ-005-004 — Single-writer truth**  
   Mutating review, comment, todo, and export operations SHALL remain server-coordinated or MCP-service-coordinated and SHALL rely on SQLite's single-writer semantics. Standalone CLI commands SHALL remain read-only.
5. **REQ-005-005 — Split lifecycle fields**  
   The `reviews` table SHALL implement `workflow_state`, `review_decision`, `exported_at`, and `row_version` exactly as defined in SPEC-001. The legacy `status` column SHALL NOT survive the cutover.
6. **REQ-005-006 — Immutable snapshot storage**  
   Every new review SHALL persist `snapshot_data` version 3 plus per-file snapshot rows in `review_files`. Post-cutover reads SHALL use persisted data and SHALL NOT regenerate hunks from live git for anchored reviews.
7. **REQ-005-007 — Review-file capture metadata**  
   `review_files` SHALL persist `content_kind`, `capture_status`, and `capture_note` in addition to the existing file metadata and `hunks_data`, consistent with SPEC-002.
8. **REQ-005-008 — Repository contract boundaries**  
   Repositories SHALL own SQL execution, row mapping, storage-local compare-and-set operations, and transaction helpers only. Services SHALL own lifecycle guards, source validation, orchestration, and cross-entity business rules.
9. **REQ-005-009 — Transactional migrations**  
   Any migration that performs more than one dependent SQL statement SHALL execute inside one explicit SQLite transaction. A failed migration SHALL leave `PRAGMA user_version` unchanged.
10. **REQ-005-010 — Schema version truthfulness**  
    Runtime code SHALL treat `PRAGMA user_version` as the canonical schema version. Standalone CLI and server runtimes SHALL fail truthfully on schema mismatch instead of guessing compatibility.
11. **REQ-005-011 — Optimistic concurrency**  
    Lifecycle-affecting writes SHALL use compare-and-set on `reviews.row_version` inside `BEGIN IMMEDIATE` transactions as defined in SPEC-001.
12. **REQ-005-012 — Hard delete model**  
    The canonical schema for the entities in this spec SHALL use hard deletes with foreign-key cascades where appropriate. No `deleted_at` soft-delete columns SHALL be introduced for these tables.
13. **REQ-005-013 — Export audit persistence**  
    Successful export SHALL persist exactly one `review_exports` row per review and SHALL set `reviews.exported_at` exactly once.
14. **REQ-005-014 — Standalone read compatibility**  
    `review list`, `review show`, `review export`, `review status`, `todo list`, `source list`, `source diff`, `export`, and `doctor` SHALL be readable from the same SQLite store without a running server, consistent with SPEC-003.
15. **REQ-005-015 — Corruption is a blocking failure**  
    When the review store is corrupt or unreadable, server and CLI runtimes SHALL refuse unsafe writes and SHALL surface a recovery-oriented error consistent with `docs/ARCHITECTURE.md` §24 and `docs/CLI.md` `ringi doctor` behavior.
16. **REQ-005-016 — Explicit degradation over silent truncation**  
    When a file snapshot cannot store complete text hunks, persistence SHALL record explicit degradation in `review_files` and snapshot integrity markers instead of silently dropping the detail.
17. **REQ-005-017 — Migration compatibility with current implementation**  
    The migration plan SHALL start from the verified current schema state in `src/routes/api/-lib/db/migrations.ts`, which currently contains six ordered migrations implemented as raw SQL strings executed through `node:sqlite`.

## Workflow / State Model

### Database open and mode selection

```text
runtime boot
  -> discover <repo-root>/.ringi/reviews.db
  -> open SQLite database
  -> enable WAL + foreign_keys
  -> inspect PRAGMA user_version
  -> if server-connected startup: apply pending migrations
  -> if standalone read path: verify schema compatibility, do not mutate
  -> expose repositories/services
```

### Review creation persistence flow

```text
adapter input
  -> ReviewService validates source through GitService
  -> ReviewService resolves snapshot anchor + parsed files
  -> BEGIN IMMEDIATE
  -> ReviewRepo.createSnapshot(review row with workflow_state='created')
  -> ReviewRepo.transitionLifecycle(created -> analyzing)
  -> ReviewFileRepo.createBulk(all file rows, including capture metadata)
  -> ReviewRepo.transitionLifecycle(analyzing -> ready) with snapshot_data v3
  -> COMMIT
```

### Lifecycle-affecting write flow

Per SPEC-001, every lifecycle-sensitive write follows:

1. `BEGIN IMMEDIATE`
2. load `reviews` row
3. reject exported rows
4. validate business guards in the service layer
5. perform compare-and-set update with `WHERE id = ? AND row_version = ?`
6. apply dependent child writes in the same transaction
7. `COMMIT`

### Schema version flow

```text
open db
  -> read PRAGMA user_version
  -> compare against compiled migration count
  -> if db version < runtime version:
       - standalone read path: fail with pending migration guidance
       - server-connected migration command/startup path: apply ordered migrations
  -> if db version > runtime version:
       - fail fast; binary is too old for this store
```

## API / CLI / MCP Implications

### Shared core implications

- Every surface reads the same persisted review truth. No adapter may maintain a shadow review representation.
- `snapshot_data` and `review_files` are the source of truth for exported and displayed diff content after creation.
- Repositories stay SQLite-specific and service-facing; adapters do not talk SQL.

### CLI implications

- Standalone read commands open the same SQLite file used by the server and rely on WAL to read while the server writes.
- Standalone commands MUST NOT run migrations or perform write fallbacks. If the schema is behind, they fail with migration guidance.
- `ringi doctor` checks SQLite presence, readability, WAL compatibility, and migration status.
- `ringi data migrate` remains the explicit schema-advancing command for local state, consistent with `docs/CLI.md`.

### HTTP/server implications

- Server startup is the canonical place to initialize SQLite for write-capable runtime use.
- Mutations continue to route through services backed by repositories over one local writer path.
- Table rebuild migrations must be safe to run during startup or `ringi data migrate` without leaving half-applied schema state.

### MCP implications

- SPEC-004 readonly enforcement happens before write-capable services are reached; persistence rules stay in the shared service/repository stack.
- MCP read operations consume the same anchored snapshot rows as CLI and HTTP.
- MCP mutation concurrency relies on the same SQLite WAL + single-writer model as the rest of the application.

## Data Model Impact

### Database-wide configuration

The canonical review store configuration is:

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
```

These are already enabled in `src/routes/api/-lib/db/database.ts`. For lifecycle-sensitive writes, transaction entry upgrades from the current generic `BEGIN` helper to `BEGIN IMMEDIATE` per SPEC-001.

### Canonical target DDL

The following DDL defines the concrete target schema for the persistence scope covered by the current docs and source.

```sql
CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  repository_path TEXT NOT NULL,
  base_ref TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('staged', 'branch', 'commits')),
  source_ref TEXT,
  snapshot_data TEXT NOT NULL,
  workflow_state TEXT NOT NULL DEFAULT 'created'
    CHECK (workflow_state IN ('created', 'analyzing', 'ready', 'in_review')),
  review_decision TEXT
    CHECK (review_decision IN ('approved', 'changes_requested')),
  exported_at TEXT,
  row_version INTEGER NOT NULL DEFAULT 0 CHECK (row_version >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (source_type = 'staged' AND source_ref IS NULL)
    OR (source_type IN ('branch', 'commits') AND source_ref IS NOT NULL)
  )
) STRICT;

CREATE TABLE review_files (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  old_path TEXT,
  status TEXT NOT NULL,
  additions INTEGER NOT NULL DEFAULT 0,
  deletions INTEGER NOT NULL DEFAULT 0,
  content_kind TEXT NOT NULL DEFAULT 'text'
    CHECK (content_kind IN ('text', 'binary', 'submodule')),
  capture_status TEXT NOT NULL DEFAULT 'complete'
    CHECK (capture_status IN ('complete', 'truncated', 'unsupported')),
  capture_note TEXT,
  hunks_data TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    NOT (
      content_kind = 'text'
      AND capture_status = 'complete'
      AND hunks_data IS NULL
    )
  )
) STRICT;

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

### Canonical target indexes

```sql
CREATE INDEX idx_reviews_repo_workflow_created
  ON reviews(repository_path, workflow_state, created_at DESC);

CREATE INDEX idx_reviews_repo_decision_created
  ON reviews(repository_path, review_decision, created_at DESC);

CREATE INDEX idx_reviews_repo_exported_created
  ON reviews(repository_path, exported_at, created_at DESC);

CREATE INDEX idx_reviews_repo_source_created
  ON reviews(repository_path, source_type, created_at DESC);

CREATE UNIQUE INDEX idx_review_files_review_path
  ON review_files(review_id, file_path);

CREATE INDEX idx_comments_review_created
  ON comments(review_id, created_at ASC);

CREATE INDEX idx_comments_review_file_line_created
  ON comments(review_id, file_path, line_number, created_at ASC);

CREATE INDEX idx_comments_review_resolved
  ON comments(review_id, resolved);

CREATE INDEX idx_todos_review_position
  ON todos(review_id, position ASC);

CREATE INDEX idx_todos_completed_position
  ON todos(completed, position ASC);

CREATE UNIQUE INDEX idx_review_exports_review_id
  ON review_exports(review_id);
```

### Snapshot storage contract

#### `reviews.snapshot_data`

For post-cutover reviews, `snapshot_data` stores SPEC-001 version 3 JSON:

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

Storage rules:

- `reviews.source_type`, `reviews.source_ref`, and `reviews.base_ref` remain queryable columns; `snapshot_data.source` is the richer immutable anchor.
- `snapshot_data` is versioned JSON text, not a separate relational explosion.
- backfilled legacy rows MUST read as version 3 after migration, with `legacy_partial` integrity when exact historical anchors cannot be reconstructed.

#### `review_files.hunks_data`

- `hunks_data` stores serialized JSON text for text-file hunks, matching the current `ReviewFileRepo.serializeHunks()` pattern.
- binary and submodule entries remain first-class `review_files` rows with `hunks_data = NULL` and explicit `content_kind` / `capture_status` metadata.
- large files that exceed configured budgets persist the file row with `capture_status = 'truncated'`; they do not silently disappear.

#### Hard-delete model

- deleting a review hard-deletes `review_files`, `comments`, `todos`, and `review_exports` through cascade relationships
- deleting comments or todos remains physical deletion
- export rows are audit facts, but they are still lifecycle-bound to their parent review row in the current model

### Migration strategy from current schema

#### Verified current baseline

`src/routes/api/-lib/db/migrations.ts` currently defines six ordered migrations:

1. `reviews`
2. `comments`
3. `reviews.source_type` + `reviews.source_ref`
4. `todos`
5. `todos.position`
6. `review_files`

Verified implementation facts:

- migrations are raw SQL strings, not ky-sely
- `runMigrations()` advances `PRAGMA user_version`
- multi-statement migration strings are split on semicolons and executed statement-by-statement
- the current generic transaction helper uses `BEGIN`, not `BEGIN IMMEDIATE`

#### Required target migration ordering

The canonical ordered migration plan is:

1. **v7 — lifecycle/export cutover**  
   Apply the SPEC-001 `reviews` rebuild and `review_exports` creation SQL exactly, including `row_version` and lifecycle indexes.
2. **v8 — `review_files` capture metadata**  
   Add `content_kind`, `capture_status`, and `capture_note` with safe defaults; backfill existing rows as `content_kind='text'` and:
   - `capture_status='complete'` when `hunks_data IS NOT NULL`
   - `capture_status='unsupported'` when `hunks_data IS NULL`
3. **v9 — comment table hardening**  
   Rebuild `comments` into constrained form with `NOT NULL` timestamps and `resolved CHECK (0,1)`.
4. **v10 — todo table hardening**  
   Rebuild `todos` into constrained form with `completed CHECK (0,1)`, explicit `position NOT NULL`, and timestamp `NOT NULL` defaults.
5. **v11 — snapshot v3 backfill and index completion**  
   Backfill every `reviews.snapshot_data` row to version 3 per SPEC-001 and create any remaining indexes not already created by v7.

#### Required migration SQL for v7

The v7 migration MUST remain byte-for-byte consistent with SPEC-001 intent:

- preflight rejection of unknown legacy `status` values
- `BEGIN IMMEDIATE`
- `reviews_v2` creation with split lifecycle fields
- copy from legacy `reviews.status` into `workflow_state` and `review_decision`
- drop legacy `reviews`
- rename `reviews_v2` to `reviews`
- create lifecycle indexes
- create `review_exports`
- `COMMIT`

#### Migration failure behavior

- if a migration fails inside an explicit transaction, SQLite rolls back the whole migration and `user_version` does not advance
- if a future migration requires multiple dependent statements, it MUST include its own `BEGIN IMMEDIATE` / `COMMIT` wrapper instead of relying on the current statement-splitting runner
- migration code MUST surface which version failed and why; vague "database error" is not acceptable

### Standalone read path

The standalone read path is the local-first read contract over the same review store.

Rules:

- repository discovery resolves `<repo-root>/.ringi/reviews.db` exactly as documented in `docs/CLI.md`
- standalone commands construct an in-process runtime over SQLite and read-only services
- standalone commands do not write SQLite, do not run lifecycle transitions, and do not apply migrations
- WAL allows these reads to proceed while the server owns writes
- if the schema version is behind or ahead of the binary's supported version, the command fails truthfully with migration guidance or "binary too old" guidance

**AMBIGUITY:** the current source does not yet define whether the standalone runtime enforces SQLite read-only mode at connection level or only by command routing and service selection. Proposed resolution: command routing remains the mandatory guarantee; if the runtime adds connection-level read-only enforcement later, it is a strengthening change, not a contract change.

## Service Boundaries

| Layer                               | Owns                                                                                             | Must not own                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `SqliteService` / DB bootstrap      | opening SQLite, WAL/foreign key pragmas, invoking migrations, exposing DB handle                 | lifecycle guards, source validation, adapter UX                                     |
| Migration runner                    | ordered schema evolution, `user_version`, transactional cutovers                                 | runtime business logic                                                              |
| `ReviewRepo`                        | row mapping, filtered queries, insert/load/CAS update helpers, export-row persistence            | deciding whether approval is allowed, deriving source anchors, export preconditions |
| `ReviewFileRepo`                    | file-row persistence, singular file lookup, hunk serialization storage                           | live git fallback, source validation, lifecycle transitions                         |
| `CommentRepo`                       | comment CRUD, count queries, resolved flag persistence                                           | reopening approved reviews, approval rules                                          |
| `TodoRepo`                          | todo CRUD, ordering persistence, transactional reorder/move helpers                              | review-lifecycle decisions                                                          |
| Review/Comment/Todo/Export services | business invariants, transaction composition across repositories, lifecycle rules, error mapping | CLI prompts, HTTP details, raw git commands beyond the source boundary              |
| `GitService`                        | resolving refs/SHAs, diff acquisition, repository metadata                                       | persistence schema, lifecycle rules, migration behavior                             |

Repository contract implications:

- thin repositories are allowed to expose compare-and-set and single-aggregate transaction helpers
- repositories are not allowed to own cross-aggregate workflow decisions
- services may compose multiple repositories inside one `BEGIN IMMEDIATE` transaction boundary when the business change spans review + comments + todos + export rows

## Edge Cases

1. **Migration failure mid-way**  
   Dependent migrations MUST be explicit transactions. Partial table rebuilds are unacceptable.
2. **Corrupt SQLite file**  
   `ringi doctor` reports the store as unhealthy; CLI and server refuse unsafe writes; recovery guidance points to restore or rebuild paths consistent with `docs/ARCHITECTURE.md` §24.
3. **Concurrent standalone read and server write**  
   WAL permits readers to observe a stable snapshot while the writer commits later changes; standalone commands do not block on owning the write path.
4. **Stale row version on lifecycle write**  
   CAS update fails and the caller receives `ReviewTransitionConflict` per SPEC-001.
5. **Large hunk payloads**  
   `hunks_data` remains TEXT in `review_files`; oversized text files degrade explicitly through `capture_status='truncated'` rather than shifting to an undocumented blob store.
6. **Branch/commit ref disappears after review creation**  
   No persistence change is required; the stored snapshot remains authoritative.
7. **Schema version mismatch: DB older than binary support**  
   Standalone reads fail with pending-migration guidance; server-connected migration path upgrades the DB.
8. **Schema version mismatch: DB newer than binary support**  
   CLI and server fail fast rather than guessing backward compatibility.
9. **Legacy rows without full anchors or hunks**  
   Backfill marks `snapshot_data.integrity.captureIntegrity='legacy_partial'` with explicit reasons; the system must not pretend those rows are fully anchored.
10. **Duplicate file rows for one review path**  
    The canonical schema prevents this with `idx_review_files_review_path`; current repo shape already assumes singular lookup.
11. **Soft-delete requests in future features**  
    This schema does not support them. Any future retention feature must be specified explicitly instead of smuggling `deleted_at` columns into the core review path.

## Observability

Persistence and migration paths MUST emit structured diagnostics for:

- resolved DB path
- opened mode (`standalone-read`, `server-write-capable`, `mcp-readonly`, `mcp-write-capable`)
- WAL and foreign-key initialization outcome
- current and target `user_version`
- migration start/success/failure with version number
- row-version conflicts on lifecycle writes
- snapshot degradation counts (`legacy_partial`, `truncated`, `unsupported`, `binary`, `submodule`)
- corruption/readability failures surfaced by diagnostics

Recommended persistence-level signals:

- count of reviews by `workflow_state`
- count of exported reviews
- count of legacy-partial reviews remaining after backfill
- count of `review_files` rows by `content_kind` and `capture_status`

## Rollout Considerations

1. Land SPEC-001 lifecycle/export migration first because later schema and service work depends on `row_version`, split lifecycle fields, and `review_exports`.
2. Land SPEC-002 `review_files` capture metadata next so source-ingestion cutover has truthful storage for binary/submodule/truncated cases.
3. Update repositories to the canonical target contracts before adapter cutovers so CLI, HTTP, and MCP all consume the same persistence truth.
4. Upgrade service-layer transactions to `BEGIN IMMEDIATE` for lifecycle-sensitive writes.
5. Keep standalone reads disabled for schema-mismatch cases instead of silently probing around the wrong shape.
6. Remove all remaining code paths that write or read legacy `reviews.status` once the lifecycle migration is complete.
7. Do not advertise commit/branch snapshot immutability as complete until `review_files.hunks_data` is persisted for all new text review files.
8. Do not introduce intelligence tables under this spec without a dedicated intelligence persistence spec. The architecture names those artifacts, but it does not yet define implementation-grade columns.

## Open Questions

1. **Should `review_files.status` be constrained to a fixed enum in SQLite?**  
   **AMBIGUITY:** the current docs and source use the field but do not define the canonical status value set. Proposed resolution: keep it unconstrained in this spec and standardize the enum in a dedicated diff-schema spec before adding a DB `CHECK`.
2. **Should export rows outlive review deletion?**  
   Current shape uses `ON DELETE CASCADE` and treats export rows as review-scoped audit facts. Proposed resolution: keep cascade for now because no docs define cross-review retention or orphan export browsing.
3. **Should standalone runtime open SQLite in connection-level read-only mode?**  
   Proposed resolution: yes when implementation support is straightforward, but command-level read-only routing remains the required compatibility contract.
4. **When should intelligence tables become concrete schema?**  
   **AMBIGUITY:** `docs/ARCHITECTURE.md` names provenance, relationship, group, confidence, and evidence artifacts, but does not define implementation-grade DDL. Proposed resolution: defer their schema to a dedicated intelligence persistence spec instead of inventing columns here.
5. **Should `todos.position` be global or review-scoped long term?**  
   The current repo computes `MAX(position)` across all todos, while CLI contracts also allow review scoping. Proposed resolution: preserve current global ordering semantics for this cutover and revisit review-scoped ordering in a dedicated todo spec.

## Acceptance Criteria

- `docs/specs/persistence-data-model.md` exists as `SPEC-005`.
- The spec contains all 17 mandatory sections required by the project template.
- The spec states that SQLite in `.ringi/reviews.db` is the canonical persistence layer and that the current implementation uses raw SQL migrations with `PRAGMA user_version`, not ky-sely.
- The canonical DDL includes `reviews`, `review_files`, `comments`, `todos`, and `review_exports` with columns, types, constraints, and indexes.
- The `reviews` table definition is consistent with SPEC-001 lifecycle fields and export persistence.
- The `review_files` definition is consistent with SPEC-002 source anchoring and capture-metadata requirements.
- The migration plan starts from the verified current six-migration baseline in `src/routes/api/-lib/db/migrations.ts` and defines ordered target migrations.
- The spec defines WAL configuration, single-writer concurrency, `row_version` compare-and-set, and standalone read behavior.
- The spec explicitly states that repositories are thin query executors and that business workflow ownership remains in services.
- The spec covers migration failure, corruption, concurrent read/write, large hunk storage, and schema-version mismatch edge cases.
