# SPEC-002: Review Source Ingestion

## Status
Draft

## Purpose
Define the canonical ingestion contract for creating a review session from a review source. This spec closes the current gap between documented source types (`staged`, `branch`, `commits`) and the actual persistence behavior in `ReviewService.create()` / `ReviewService.getFileHunks()`, where only staged reviews persist hunks and branch/commit reviews are re-diffed from live git later. The goal is an immutable, reproducible snapshot captured at review creation time and then consumed uniformly by CLI, HTTP API, UI, and MCP.

## Scope
This spec covers:
- the three review source types: `staged`, `branch`, and `commits`
- source validation before a review row is created
- source resolution into repository metadata, file set, and diff hunks
- snapshot anchoring rules for persisted review snapshots
- the ingestion pipeline from adapter input to persisted review rows and `review_files`
- source-specific failure modes and integrity markers
- the `GitService` adapter boundary used during ingestion
- how source ingestion feeds the lifecycle defined in `docs/specs/review-lifecycle.md`

## Non-Goals
This spec does not cover:
- comment, suggestion, todo, or export workflows beyond their dependency on immutable snapshot inputs
- intelligence extraction, provenance, grouped file tree, confidence scoring, or impact minimap generation
- UI interaction design for source selection beyond the required source contract
- live review refresh after creation; this spec is about capture, not re-snapshotting an existing review
- generalized git exploration commands outside review-scoped source discovery and preview

## Canonical References
- `docs/specs/review-lifecycle.md`
  - §3 DD-2 — immutable and self-sufficient review snapshots
  - §4.1 — `ReviewSnapshotData` v3 and lifecycle-facing review shape
  - §8 — target `reviews` persistence schema
- `docs/ARCHITECTURE.md`
  - §9 — Source bounded context owns review source resolution and git diff acquisition
  - §11 — review creation data flow
  - §14 — review session as immutable snapshot
  - §15 — review source model
  - §16 — diff processing pipeline
  - §24 — source mismatch failure mode
- `docs/CLI.md`
  - `ringi review create`
  - `ringi source list`
  - `ringi source diff`
  - `ringi review status`
- `docs/MCP.md`
  - `reviews.create`
  - `sources.list`
  - `sources.previewDiff`
  - `session.context`
- `src/routes/api/-lib/services/review.service.ts`
- `src/routes/api/-lib/services/git.service.ts`
- `src/api/schemas/review.ts`
- `src/routes/new.tsx`

## Terminology
- **Review source** — the user-selected diff origin used to create a review session: `staged`, `branch`, or `commits`.
- **Requested source** — the adapter-level input as supplied by CLI, HTTP API, UI, or MCP.
- **Resolved source anchor** — the exact immutable metadata captured at creation time after git validation, including the refs and SHAs needed to explain what was reviewed.
- **Snapshot anchoring** — persisting the diff-derived file list and hunks at review creation time so later reads never depend on live git state.
- **Capture integrity** — whether a file snapshot is fully persisted (`complete`) or persisted with an explicit limitation such as `binary`, `submodule`, or `truncated`.
- **Legacy partial snapshot** — a pre-cutover review whose source metadata or hunks are incomplete and may require degraded reads as defined in SPEC-001.

## Requirements
1. **REQ-002-001 — Source type support**  
   The core review creation path MUST accept exactly three source types: `staged`, `branch`, and `commits`.
2. **REQ-002-002 — Single ingestion pipeline**  
   CLI, HTTP API, UI, and MCP MUST all create reviews by invoking the same core source-ingestion path. Adapters MAY normalize input shape, but they MUST NOT implement separate git resolution logic.
3. **REQ-002-003 — Validation before persistence**  
   Source validation MUST complete before any `reviews` or `review_files` row is written. Invalid sources MUST fail the request with no partial review session persisted.
4. **REQ-002-004 — Transactional persistence**  
   Review creation MUST persist the review row, snapshot metadata, and all `review_files` rows in one transaction.
5. **REQ-002-005 — Immutable hunk capture**  
   For every new review, each text file in the resolved diff MUST persist its hunks at creation time. `ReviewService.getFileHunks()` MUST read persisted hunks for those reviews and MUST NOT re-run git diff commands.
6. **REQ-002-006 — Explicit source anchoring**  
   Every review snapshot MUST persist source metadata sufficient to explain what was reviewed: source type, requested source reference, resolved base/head refs or SHAs when applicable, and capture timestamp.
7. **REQ-002-007 — Staged source validation**  
   `staged` review creation MUST fail when the staged diff is empty.
8. **REQ-002-008 — Branch source validation**  
   `branch` review creation MUST fail when the requested branch/ref does not resolve or the resulting diff is empty.
9. **REQ-002-009 — Commit source validation**  
   `commits` review creation MUST fail when the requested commit set cannot be normalized into an ordered, existing commit list or the resulting diff is empty.
10. **REQ-002-010 — Immutable reads after creation**  
    After a review is created, subsequent branch deletion, force-push, commit garbage collection, working-tree changes, or staged-index changes MUST NOT alter the diff hunks returned for that review.
11. **REQ-002-011 — Source-neutral lifecycle entry**  
    Source ingestion MUST feed the same lifecycle FSM defined by SPEC-001. Source type affects validation and anchoring only; it MUST NOT create alternative lifecycle states.
12. **REQ-002-012 — Binary and submodule representation**  
    Binary files and submodule entries MUST be persisted as review files with explicit capture metadata. They MUST NOT be silently dropped because they lack text hunks.
13. **REQ-002-013 — Rename preservation**  
    Renamed or moved files MUST persist both `file_path` and `old_path` so later review surfaces can represent the rename without recomputing it from git.
14. **REQ-002-014 — Large-diff explicit degradation**  
    If configured ingestion limits prevent full hunk capture for a file, the persisted review file MUST record an explicit degraded capture state. The system MUST NOT silently truncate and pretend the snapshot is complete.
15. **REQ-002-015 — Gap visibility**  
    Any review created before this cutover that lacks persisted hunks or complete source anchors MUST surface degraded integrity per SPEC-001 instead of being presented as a fully anchored snapshot.

## Workflow / State Model
### Ingestion pipeline
```text
adapter input
  -> source normalization
  -> git validation
  -> source anchor resolution
  -> raw diff acquisition
  -> diff parse into files + hunks
  -> file-level capture classification
  -> transaction: persist review + review_files
  -> lifecycle enters created
  -> downstream analysis may advance created -> analyzing -> ready
```

### Source-specific resolution rules
| Source type | Requested input | Diff acquisition | Persisted sourceRef | Persisted source anchor semantics |
| --- | --- | --- | --- | --- |
| `staged` | no ref | `git diff --cached --no-color --unified=3` | `NULL` | `baseRef = 'HEAD'`, `baseSha = current HEAD sha`, `headRef = NULL`, `headSha = NULL`; persisted hunks are the authoritative snapshot |
| `branch` | branch/ref name | `git diff <branch>...HEAD --no-color --unified=3` | requested branch/ref name | `baseRef = requested branch name`, `baseSha = resolved merge-base(<branch>, HEAD)`, `headRef = current symbolic HEAD if available`, `headSha = current HEAD sha` |
| `commits` | commit range or commit list | normalized ordered commit list -> diff over that bounded history | canonical comma-separated full SHAs in oldest->newest order | `baseRef = NULL`, `baseSha = parent(oldest selected commit)` when available, `headRef = NULL`, `headSha = newest selected commit sha` |

### Lifecycle integration
Per `docs/specs/review-lifecycle.md`, successful source ingestion creates an immutable review snapshot and enters `workflow_state = 'created'`. Source ingestion does not change the lifecycle graph. After capture succeeds, the same downstream analysis path moves the review through `created -> analyzing -> ready`. Source-specific validation failures happen before lifecycle entry and therefore produce no review row.

### Current implementation gaps against this model
- `ReviewService.create()` persists hunks only when `sourceType === 'staged'`; branch and commit reviews store `hunks_data = null`.
- `ReviewService.getFileHunks()` re-runs `git.getBranchDiff()` / `git.getCommitDiff()` for branch and commit reviews, violating immutable snapshots.
- `snapshot_data` version 2 currently stores repository metadata only; it does not persist source anchors or diff summary.
- `ReviewService.create()` writes the review row and file rows separately, so the operation is not atomic.
- `GitService.getCommitDiff()` expects a SHA array, but `CLI.md` documents `--commits <sha[,sha...]|range>` and `ReviewService.create()` only splits commas; documented range syntax is not implemented.
- `src/routes/new.tsx` creates staged reviews only and does not expose branch or commit creation in the UI.

## API / CLI / MCP Implications
### HTTP / core API
- The canonical create contract remains source-driven, but it MUST normalize into one internal source-ingestion call.
- `CreateReviewInput` MUST continue to discriminate by `sourceType`, but adapters MUST convert user-friendly inputs into a canonical source reference before invoking the service.
- `getFileHunks()` MUST become a pure snapshot read for all post-cutover reviews.

### CLI
- `ringi review create` remains the canonical creation command.
- `--source staged` continues to default when no source is provided.
- `--source branch --branch <name>` MUST validate the branch exists before persistence.
- `--source commits --commits <value>` MUST accept either a commit range or a comma-separated list, but the adapter MUST normalize both to the canonical ordered SHA list before calling the service.
- `ringi source list` and `ringi source diff` remain read-only discovery/preview commands and MUST use the same normalization and validation rules as creation.
- `ringi review status --source <type>` MUST report source-specific availability based on live repository state, but MUST NOT imply that an already-created review can change with live git.

### MCP
- `sources.list()` and `sources.previewDiff()` remain the discovery surface for agents.
- `reviews.create()` MUST ultimately resolve to the same ingestion path as CLI/HTTP.
- For branch creation, MCP inputs `{ type: 'branch', baseRef, headRef }` MUST resolve to the same persisted anchor semantics as CLI branch creation; the authoritative persisted diff remains the captured snapshot, not later ref lookups.
- For commit creation, MCP inputs `{ type: 'commits', commits: string[] }` MUST be normalized to the canonical oldest->newest full SHA list before persistence.

### UI
- The UI MUST stop hardcoding staged-only creation. `src/routes/new.tsx` currently posts `{ sourceType: 'staged', sourceRef: null }` only; post-cutover UI MUST expose the same three source types documented in `CLI.md`.

## Data Model Impact
### Reviews table
This spec builds on the `reviews` table shape defined in SPEC-001. Source ingestion uses these persisted fields:
- `source_type` — queryable discriminator for `staged | branch | commits`
- `source_ref` — canonical requested source reference:
  - `NULL` for `staged`
  - requested branch/ref name for `branch`
  - canonical comma-separated full SHAs in oldest->newest order for `commits`
- `snapshot_data` — versioned structured JSON with repository metadata, resolved source anchor, diff summary, and integrity markers

### Review snapshot JSON
For reviews created after this cutover, `snapshot_data` MUST conform to SPEC-001 `ReviewSnapshotData` version 3 with the following source semantics:

```ts
{
  version: 3,
  repository: {
    name: string,
    branch: string,
  },
  source: {
    type: 'staged' | 'branch' | 'commits',
    sourceRef: string | null,
    baseRef: string | null,
    baseSha: string | null,
    headRef: string | null,
    headSha: string | null,
    capturedAt: string,
  },
  diffSummary: {
    files: number,
    additions: number,
    deletions: number,
  },
  integrity: {
    captureIntegrity: 'complete' | 'legacy_partial',
    reasons: SnapshotIntegrityReason[],
  },
}
```

### Review files table
`review_files` MUST become the authoritative per-file snapshot store. This spec requires the following additive shape:

```sql
ALTER TABLE review_files ADD COLUMN content_kind TEXT NOT NULL DEFAULT 'text'
  CHECK (content_kind IN ('text', 'binary', 'submodule'));

ALTER TABLE review_files ADD COLUMN capture_status TEXT NOT NULL DEFAULT 'complete'
  CHECK (capture_status IN ('complete', 'truncated', 'unsupported'));

ALTER TABLE review_files ADD COLUMN capture_note TEXT;

-- application or DB CHECK invariant
-- content_kind = 'text' AND capture_status = 'complete' => hunks_data IS NOT NULL
```

Per-file persistence contract:
- `hunks_data` contains serialized hunks for text files whose capture is complete.
- `content_kind = 'binary'` means the file is part of the review snapshot but has no text hunks.
- `content_kind = 'submodule'` means the diff represents submodule pointer movement, not inline file content.
- `capture_status = 'truncated'` means the file is present, but full hunks were not stored because ingestion limits were exceeded.
- `old_path` remains the source of truth for rename/move representation.

**AMBIGUITY:** no current document defines concrete file-count or hunk-size limits. This spec requires configurable ingestion budgets and explicit degradation when exceeded, but the default numeric thresholds remain open.

## Service Boundaries
- **ReviewService owns** orchestration of source ingestion, persistence transaction boundaries, error mapping, and lifecycle entry into `created`.
- **GitService owns** repository inspection and raw git operations only: resolving refs/SHAs, reading diffs, listing branches/commits, and retrieving repository info.
- **GitService MUST NOT own** review persistence rules, lifecycle decisions, snapshot JSON shape, or degraded-capture policy.
- **Adapters own** input normalization only:
  - CLI converts `--branch` / `--commits` flags into canonical create input.
  - MCP maps namespaced objects into the same create input.
  - UI submits the same source model instead of hardcoding staged.
- **ReviewService MUST NOT call git after creation-time capture** when serving diff hunks for a fully anchored review.

## Edge Cases
- **Empty diff** — reject creation with a source-specific error and no persisted rows.
- **Binary files** — persist a `review_files` row with `content_kind = 'binary'`, `hunks_data = NULL`, and explicit capture note; do not drop the file.
- **Very large diffs** — apply configurable ingestion budgets. Files over the budget remain in the review with `capture_status = 'truncated'`; overall snapshot integrity remains explicit.
- **Branch deleted after review creation** — no effect on the stored review because persisted hunks are authoritative.
- **Force push invalidating commit range** — no effect on the stored review; only source preview/new review creation should observe the changed history.
- **Staged changes modified after review creation** — no effect on the stored review; the review is anchored to the persisted hunks captured at creation time.
- **Submodule changes** — persist them as `content_kind = 'submodule'` entries, not as missing files.
- **Renamed/moved files** — persist both `old_path` and `file_path`; later readers MUST NOT infer rename status from live git.
- **Detached HEAD** — branch-based creation MUST persist `headSha` even when a symbolic `headRef` is unavailable.
- **Repository with no commits** — current implementation rejects this before source validation. **AMBIGUITY:** `CLI.md` and `ARCHITECTURE.md` do not state whether initial-commit reviews should be supported. Proposed resolution: keep the current rejection in this spec and revisit empty-tree support separately.
- **Commit range input syntax** — adapters MUST normalize ranges into ordered commit SHAs before persistence. Passing raw range text through `source_ref` is insufficient because current service logic only splits commas.

## Observability
The ingestion path MUST emit structured logs for:
- source type requested
- normalized source reference
- resolved source anchors (`baseRef/baseSha/headRef/headSha`)
- file count and diff summary
- capture degradation counts (`binary`, `submodule`, `truncated`)
- validation failures by source type
- transaction success/failure duration

Diagnostics SHOULD expose:
- source validation failures in `ringi doctor` or equivalent local diagnostics
- count of post-cutover reviews with degraded file capture
- count of legacy reviews still relying on degraded integrity markers from SPEC-001

## Rollout Considerations
1. Apply SPEC-001 review-lifecycle schema first so `snapshot_data` version 3 and derived lifecycle fields exist.
2. Add the new `review_files` capture metadata columns before changing service behavior.
3. Update `ReviewService.create()` to persist hunks for branch and commit reviews inside one transaction.
4. Update `ReviewService.getFileHunks()` to read only persisted hunks for post-cutover reviews.
5. Keep legacy fallback behavior only for pre-cutover rows explicitly marked as `legacy_partial` integrity; do not allow new rows to use live git fallback.
6. Update CLI and MCP adapters to normalize commit ranges/lists before service entry.
7. Update the UI to expose all three source types instead of staged-only creation.

Backward compatibility rules:
- Existing reviews remain readable.
- Existing incomplete snapshots MUST surface degraded integrity, not silent recomputation.
- New reviews created after the cutover MUST satisfy this spec fully.

## Open Questions
1. **What are the default ingestion limits for file count and hunk size?**  
   Proposed resolution: add config-backed limits and finalize default values in implementation after measuring representative review sizes.
2. **Should `commits` preserve the user-entered range string in addition to the normalized SHA list?**  
   Proposed resolution: no. Persist the canonical ordered SHA list in `source_ref`; adapters may keep the original CLI argument only in ephemeral command diagnostics.
3. **Should initial-commit staged reviews be supported by diffing against the empty tree?**  
   Proposed resolution: not in this spec. Preserve the current `NO_COMMITS` rejection until a dedicated initial-repository behavior spec exists.
4. **Should `capture_status = 'truncated'` block lifecycle progression to `ready`?**  
   Proposed resolution: no. The review remains valid but explicitly degraded; downstream analysis may decide whether to mark intelligence partial.
5. **How should MCP branch input `{ baseRef, headRef }` map when `headRef` is omitted or detached?**  
   Proposed resolution: persist `headSha` always; persist `headRef` only when it resolves symbolically.

## Acceptance Criteria
- `docs/specs/review-source-ingestion.md` exists and contains all mandatory sections.
- The spec explicitly references `docs/specs/review-lifecycle.md` for lifecycle integration and snapshot schema alignment.
- The spec defines all three source types and their persisted source-anchor semantics.
- The spec states that hunks are persisted at review creation time for all new text review files and never regenerated from live git afterward.
- The spec defines the ingestion pipeline from adapter input to persisted snapshot.
- The spec defines validation failure behavior for `staged`, `branch`, and `commits`.
- The spec defines how binary files, submodules, renames, and large diff degradation are represented in persistence.
- The spec identifies the current implementation gaps in `ReviewService.create()`, `ReviewService.getFileHunks()`, commit-range handling, non-atomic persistence, and staged-only UI creation.
- The spec defines concrete `reviews` / `review_files` persistence expectations for source ingestion.
