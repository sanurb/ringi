# Work Plan: Stable Hunks → Coverage → External Annotations

> Implementation sequence and GitHub issue breakdown.
> Created: 2026-04-07

---

## Implementation Sequence

```
1. HUNK-1  Stable Hunk Identity (schema + repo + service)
2. HUNK-2  Stable Hunk Identity (migration + tests)
      ↓
3. COV-1   ReviewCoverage domain model (schema + repo + service)
4. COV-2   ReviewCoverage persistence (migration + tests)
      ↓
5. COV-3   Coverage CLI surface (ringi coverage)
6. COV-4   Coverage Web UI surface (progress indicators)
      ↓
7. ANN-1   External ReviewAnnotation domain model
8. ANN-2   External ReviewAnnotation API + ingestion
9. ANN-3   External ReviewAnnotation minimal rendering
```

Dependencies are strictly linear within each workstream.
COV depends on HUNK. ANN depends on HUNK but not on COV.

---

## Parent Issue 1: Stable Hunk Identity

**Title:** `feat: stable hunk identity for review_files`

**Purpose:** Give every hunk in a review a deterministic, position-based identity that survives review reloads and is stable across CLI/Web/MCP surfaces. This is the foundation for both coverage tracking and external annotations — neither can anchor to specific code locations without stable hunk IDs.

**Scope:**

- Add a `hunk_id` derivation function to `packages/core`
- Persist hunk identities in `review_files` (or a new `review_hunks` table)
- Expose hunk IDs in `ReviewService.getFileHunks` responses
- No UI changes in this issue

**Acceptance criteria:**

- [ ] A pure function `deriveHunkId(filePath, oldStart, oldLines, newStart, newLines) → string` exists in `packages/core/src/schemas/diff.ts`
- [ ] Format: `{filePath}:@-{oldStart},{oldLines}+{newStart},{newLines}`
- [ ] `review_hunks` table created in migration v7 with columns: `id TEXT PK`, `review_file_id TEXT FK`, `hunk_index INTEGER`, `old_start INTEGER`, `old_lines INTEGER`, `new_start INTEGER`, `new_lines INTEGER`, `stable_id TEXT UNIQUE NOT NULL`, `created_at TEXT`
- [ ] `ReviewHunkRepo` service exists with `findByReviewFile`, `findByStableId`, `createBulk`
- [ ] `ReviewService.create()` persists hunk rows alongside review_file rows
- [ ] `ReviewService.getFileHunks()` returns hunks with their `stableId` field
- [ ] Domain tests: stable ID generation is deterministic, different hunks produce different IDs, same hunk always produces the same ID
- [ ] Persistence tests: hunks survive write→read roundtrip, FK cascade works on review delete

**Non-goals:**

- No coverage tracking yet
- No API endpoint changes (hunks are already returned by getFileHunks, just adding the stableId field)
- No Web UI changes

**Dependencies:** None

**Labels:** `domain`, `schema`, `foundation`

### Sub-issues

#### HUNK-1: `feat(core): deriveHunkId function and ReviewHunk schema`

**Purpose:** Define the stable ID derivation and the Effect Schema types.

**Acceptance criteria:**

- [ ] `deriveHunkId()` in `packages/core/src/schemas/diff.ts`
- [ ] `ReviewHunkId` branded type
- [ ] `ReviewHunk` Effect Schema struct with all fields
- [ ] `parseHunkId(stableId) → { filePath, oldStart, oldLines, newStart, newLines } | null`
- [ ] Unit tests for derivation determinism, parsing roundtrip, edge cases (renamed files, zero-line hunks)

**Labels:** `domain`, `schema`

---

#### HUNK-2: `feat(core): review_hunks migration, repo, and service integration`

**Purpose:** Persist hunks and wire them into the review creation flow.

**Acceptance criteria:**

- [ ] Migration v7 creates `review_hunks` table
- [ ] `ReviewHunkRepo` with `findByReviewFile`, `findByStableId`, `createBulk`, `deleteByReview`
- [ ] `ReviewHunkRepo` added to `RepoLive` layer in `runtime.ts`
- [ ] `ReviewService.create()` writes hunk rows inside the same transaction as review_file rows
- [ ] `ReviewService.getFileHunks()` response includes `stableId` per hunk
- [ ] Existing review creation tests still pass
- [ ] New persistence tests: roundtrip, cascade delete, bulk insert of 100+ hunks

**Dependencies:** HUNK-1

**Labels:** `domain`, `persistence`, `migration`

---

## Parent Issue 2: ReviewCoverage Domain Model

**Title:** `feat: ReviewCoverage as explicit domain concept`

**Purpose:** Track which hunks (and which line ranges within hunks) have been inspected by a human reviewer. Coverage is evidence of inspection, not evidence of understanding or approval. It is independent from comments, suggestions, and review status.

**Scope:**

- New `review_coverage` table
- `CoverageService` in `packages/core`
- Core use cases: mark hunk as reviewed, mark line range as reviewed, unmark, get coverage summary per review
- No UI or CLI in this issue

**Acceptance criteria:**

- [ ] `review_coverage` table in migration v8: `id TEXT PK`, `review_id TEXT FK`, `hunk_stable_id TEXT NOT NULL`, `start_line INTEGER` (0-based, nullable for full-hunk), `end_line INTEGER` (0-based, nullable for full-hunk), `created_at TEXT`
- [ ] `CoverageRepo` with `markRange`, `unmarkRange`, `findByReview`, `findByHunk`, `deleteByReview`
- [ ] `CoverageService` with `markHunkReviewed(reviewId, hunkStableId)`, `markRangeReviewed(reviewId, hunkStableId, startLine, endLine)`, `unmark(reviewId, hunkStableId)`, `getSummary(reviewId) → { totalHunks, reviewedHunks, partialHunks, unreviewedHunks }`
- [ ] Overlapping ranges merge correctly (same logic as critique's mergeRanges)
- [ ] Coverage is independent: deleting a comment does not affect coverage. Changing review status does not affect coverage.
- [ ] Domain tests: mark/unmark lifecycle, range merging, summary computation, independence from comments

**Non-goals:**

- No automatic coverage from comments (coverage is explicit action)
- No "review quality" scoring — coverage tracks inspection, not quality
- No coverage from AI/external annotations
- No percentage display threshold or gamification

**Dependencies:** Parent Issue 1 (stable hunk IDs)

**Labels:** `domain`, `schema`, `foundation`

### Sub-issues

#### COV-1: `feat(core): CoverageService schema, repo, and service`

**Purpose:** Define the domain model and service layer.

**Acceptance criteria:**

- [ ] `packages/core/src/schemas/coverage.ts` with `CoverageEntry` schema, `CoverageSummary` schema
- [ ] `packages/core/src/repos/coverage.repo.ts` with `CoverageRepo` service
- [ ] `packages/core/src/services/coverage.service.ts` with `CoverageService`
- [ ] Range merging logic with unit tests
- [ ] Service-level tests for mark/unmark/summary lifecycle

**Labels:** `domain`, `schema`

---

#### COV-2: `feat(core): review_coverage migration and persistence tests`

**Purpose:** Wire persistence and ensure roundtrip correctness.

**Acceptance criteria:**

- [ ] Migration v8 creates `review_coverage` table
- [ ] `CoverageRepo` added to `RepoLive` in `runtime.ts`
- [ ] `CoverageService` added to `CoreLive` in `runtime.ts`
- [ ] Persistence tests: write→read, cascade on review delete, 500+ coverage entries for large review
- [ ] Existing tests unaffected

**Dependencies:** COV-1

**Labels:** `persistence`, `migration`

---

## Parent Issue 3: Coverage Surface Integration

**Title:** `feat: coverage visibility in CLI and Web UI`

**Purpose:** Expose the ReviewCoverage domain model in the CLI and Web UI so reviewers can see which hunks they've inspected and which they haven't. Keep it minimal — this is information display, not a full UX overhaul.

**Scope:**

- CLI: `ringi coverage <reviewId>` command
- Web UI: reviewed/unreviewed indicator per file in file tree, summary counts
- API: coverage endpoints in domain-api.ts
- MCP: `reviews.getCoverage(reviewId)` in sandbox

**Acceptance criteria:**

- [ ] `GET /api/reviews/:id/coverage` returns `CoverageSummary`
- [ ] `POST /api/reviews/:id/coverage/mark` accepts `{ hunkStableId, startLine?, endLine? }`
- [ ] `DELETE /api/reviews/:id/coverage/:hunkStableId` unmarks
- [ ] CLI `ringi coverage <reviewId>` prints summary table: total hunks, reviewed, partial, unreviewed
- [ ] CLI `ringi coverage <reviewId> --files` prints per-file coverage breakdown
- [ ] Web UI file tree shows reviewed/partial/unreviewed badge per file (green/yellow/gray dot)
- [ ] Web UI review header shows coverage summary (e.g., "12/18 hunks reviewed")
- [ ] MCP sandbox: `reviews.getCoverage(id)`, `reviews.markReviewed(id, hunkStableId)`

**Non-goals:**

- No inline hunk-level review buttons in the diff viewer (defer to later)
- No automatic marking when a user scrolls past a hunk
- No coverage-based review blocking or gating

**Dependencies:** Parent Issue 2

**Labels:** `cli`, `web`, `api`, `mcp`

### Sub-issues

#### COV-3: `feat(cli): ringi coverage command`

**Purpose:** CLI surface for coverage inspection.

**Acceptance criteria:**

- [ ] `ringi coverage <reviewId>` works in standalone mode (direct SQLite read)
- [ ] `--files` flag for per-file breakdown
- [ ] `--json` flag for structured output
- [ ] Human-readable table output by default

**Dependencies:** COV-2

**Labels:** `cli`

---

#### COV-4: `feat(web): coverage indicators in file tree and review header`

**Purpose:** Minimal Web UI coverage visibility.

**Acceptance criteria:**

- [ ] File tree shows per-file coverage dot (green = all hunks reviewed, yellow = partial, gray = none)
- [ ] Review header shows summary count
- [ ] Data fetched from `/api/reviews/:id/coverage` endpoint
- [ ] SSE event on coverage mutation refreshes coverage display

**Dependencies:** COV-2

**Labels:** `web`, `ui`

---

## Parent Issue 4: External ReviewAnnotation Model

**Title:** `feat: external ReviewAnnotation as separate domain entity`

**Purpose:** Accept structured annotations from external sources (AI agents, CI tools, linters) without mixing them with human comments. External annotations have richer metadata (source, severity, reasoning) and different lifecycle semantics (source-scoped clear, no draft/resolved state).

**Scope:**

- New `review_annotations` table
- `AnnotationService` in `packages/core`
- HTTP ingestion endpoint
- SSE broadcast on mutation
- Minimal rendering in Web UI

**Acceptance criteria:**

- [ ] `review_annotations` table in migration v9: `id TEXT PK`, `review_id TEXT FK`, `source TEXT NOT NULL`, `file_path TEXT NOT NULL`, `hunk_stable_id TEXT`, `line_start INTEGER NOT NULL`, `line_end INTEGER NOT NULL`, `side TEXT DEFAULT 'new'`, `type TEXT DEFAULT 'comment'`, `severity TEXT`, `reasoning TEXT`, `content TEXT NOT NULL`, `suggested_code TEXT`, `author TEXT`, `created_at TEXT`
- [ ] `AnnotationRepo` with `add(batch)`, `removeById`, `clearBySource(reviewId, source)`, `findByReview`, `findByFile`, `countByReview`
- [ ] `AnnotationService` with typed Effect service methods
- [ ] `POST /api/reviews/:id/annotations` accepts single or batch input, validates via Effect Schema
- [ ] `DELETE /api/reviews/:id/annotations?source=X` clears by source
- [ ] `GET /api/reviews/:id/annotations` returns all with optional `?filePath=` filter
- [ ] SSE event emitted on add/remove/clear mutations
- [ ] Human comments (`comments` table) are completely unaffected
- [ ] Domain tests: add, batch add, clear by source, source isolation, FK cascade

**Non-goals:**

- No annotation editing (external annotations are write-once from source, removable only)
- No annotation draft/resolved state
- No inline rendering in diff viewer (defer — just show count badges for now)
- No ACP-based ingestion (deferred)

**Dependencies:** Parent Issue 1 (hunk_stable_id for anchoring, optional but recommended)

**Labels:** `domain`, `schema`, `api`, `interop`

### Sub-issues

#### ANN-1: `feat(core): ReviewAnnotation schema, repo, and service`

**Purpose:** Define the separate domain model.

**Acceptance criteria:**

- [ ] `packages/core/src/schemas/annotation.ts` with `ReviewAnnotation`, `CreateAnnotationInput`, `AnnotationSource`, `AnnotationSeverity`, `AnnotationType`
- [ ] `packages/core/src/repos/annotation.repo.ts` with `AnnotationRepo`
- [ ] `packages/core/src/services/annotation.service.ts` with `AnnotationService`
- [ ] Domain tests for add/batch/clear/query lifecycle
- [ ] Type values: `comment | suggestion | concern`. Severity values: `critical | important | nit | pre_existing`

**Labels:** `domain`, `schema`

---

#### ANN-2: `feat(core+api): annotation ingestion endpoint and SSE`

**Purpose:** HTTP path for external sources to submit annotations.

**Acceptance criteria:**

- [ ] Migration v9 creates `review_annotations` table
- [ ] `AnnotationRepo` and `AnnotationService` in `CoreLive`
- [ ] `POST /api/reviews/:id/annotations` in `domain-api.ts`
- [ ] `DELETE /api/reviews/:id/annotations` with `?source=` query
- [ ] `GET /api/reviews/:id/annotations` with optional `?filePath=` query
- [ ] SSE events on mutations via `EventService`
- [ ] Persistence tests: roundtrip, cascade, batch of 200 annotations

**Dependencies:** ANN-1

**Labels:** `api`, `persistence`, `migration`

---

#### ANN-3: `feat(web): annotation count badges in file tree`

**Purpose:** Minimal rendering so reviewers know external annotations exist.

**Acceptance criteria:**

- [ ] File tree shows annotation count badge per file (separate from comment count)
- [ ] Review header shows total external annotation count
- [ ] Badge refreshes on SSE annotation events
- [ ] No inline rendering in diff viewer yet

**Dependencies:** ANN-2

**Labels:** `web`, `ui`

---

## Recommended GitHub Issue Creation Order

Create in this exact order so dependency links (`blocked by #N`) work:

1. **HUNK-1** — `feat(core): deriveHunkId function and ReviewHunk schema`
2. **HUNK-2** — `feat(core): review_hunks migration, repo, and service integration` (blocked by #1)
3. **Parent: Stable Hunk Identity** — link to #1, #2 as task list
4. **COV-1** — `feat(core): CoverageService schema, repo, and service` (blocked by #2)
5. **COV-2** — `feat(core): review_coverage migration and persistence tests` (blocked by #4)
6. **COV-3** — `feat(cli): ringi coverage command` (blocked by #5)
7. **COV-4** — `feat(web): coverage indicators in file tree and review header` (blocked by #5)
8. **Parent: ReviewCoverage Domain Model** — link to #4, #5
9. **Parent: Coverage Surface Integration** — link to #6, #7
10. **ANN-1** — `feat(core): ReviewAnnotation schema, repo, and service` (blocked by #2)
11. **ANN-2** — `feat(core+api): annotation ingestion endpoint and SSE` (blocked by #10)
12. **ANN-3** — `feat(web): annotation count badges in file tree` (blocked by #11)
13. **Parent: External ReviewAnnotation Model** — link to #10, #11, #12
