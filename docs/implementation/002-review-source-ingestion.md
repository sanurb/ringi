# 002: Review Source Ingestion

**Source Spec:** `docs/specs/review-source-ingestion.md`
**Status:** queued

## Objective

Make review creation persist one immutable snapshot contract for `staged`, `branch`, and `commits`. This delivery removes live-git hunk regeneration for post-cutover reviews and makes source capture atomic, explicit, and reproducible.

## Why Now

SPEC-002 sits immediately after lifecycle because source anchoring depends on the split review model and snapshot integrity markers from SPEC-001. Once lifecycle truth exists, ingestion becomes the next boundary that must stop lying.

## Likely Files

- `src/routes/api/-lib/db/migrations.ts`
- `src/api/schemas/review.ts`
- `src/api/schemas/diff.ts`
- `src/routes/api/-lib/repos/review.repo.ts`
- `src/routes/api/-lib/repos/review-file.repo.ts`
- `src/routes/api/-lib/services/review.service.ts`
- `src/routes/api/-lib/services/git.service.ts`
- `src/routes/api/-lib/services/diff.service.ts`
- `src/routes/reviews/new.tsx`
- `src/api/domain-api.ts`
- `src/routes/api/$.ts`

## Implementation Order

1. Add the additive `review_files` capture metadata columns and any review snapshot version changes needed for SPEC-002 source anchors.
2. Define the canonical internal source-normalization contract for `staged`, `branch`, and `commits`, including commit-range normalization before persistence.
3. Refactor `ReviewService.create()` into one transactional ingestion pipeline: validate source, resolve anchors, acquire diff, parse files, classify capture integrity, persist review plus `review_files` in one write boundary.
4. Extend `GitService` only where source validation or normalization is missing; keep git resolution in the source boundary and persistence/lifecycle in review orchestration.
5. Cut `ReviewService.getFileHunks()` over to persisted snapshot reads for post-cutover reviews and confine any fallback behavior to explicitly degraded legacy rows.
6. Update adapters so UI and HTTP creation flows can express all three source types without introducing alternate ingestion logic.
7. Add validation coverage for empty staged diffs, missing branches, invalid commit sets, binary/submodule capture, and immutable reads after creation.

## Dependency Notes

Requires SPEC-001 lifecycle fields and snapshot integrity semantics first. It unblocks CLI, MCP, persistence, and service-boundary work that depends on stable source anchors and persisted hunks.

## Risks

- Large diffs can make review creation slow or memory-heavy if capture budgets are not enforced explicitly.
- Binary, submodule, and truncated files can disappear silently if ingestion still assumes text hunks are mandatory.
- Commit-range normalization can drift across adapters if normalization is not centralized.
- Transaction boundaries can still leak partial reviews if review rows and file rows are not persisted together.
- UI creation can remain staged-only if transport contracts land before the route is updated.

## Test & Validation Strategy

- Migration test covering new `review_files` metadata and snapshot JSON compatibility.
- Service tests for `staged`, `branch`, and `commits` validation failures with zero persisted rows on failure.
- Transaction test proving review row and file rows commit or roll back together.
- Snapshot-read test proving `getFileHunks()` does not call live git for post-cutover branch/commit reviews.
- Capture-integrity tests for binary, submodule, rename, and truncated-file cases.
- Adapter test proving the create surface accepts all three source types and normalizes commit input consistently.

## Acceptance Criteria

- [ ] New reviews persist anchored source metadata and per-file capture metadata for all three source types.
- [ ] Review creation is transactional across review row and `review_files` persistence.
- [ ] Post-cutover `getFileHunks()` reads persisted hunks instead of re-running branch/commit git diff commands.
- [ ] Binary, submodule, rename, and degraded-capture cases remain visible in persisted review files.
- [ ] Commit range or list input is normalized before persistence instead of stored as raw adapter text.
- [ ] UI/HTTP creation paths call the same ingestion pipeline and are no longer staged-only by design.
- [ ] Tests cover validation failures, immutable reads, capture integrity, and transactional rollback.

## Context Pack

Exact files and sections to load when this becomes the active spec:

- Spec file: `docs/specs/review-source-ingestion.md`
- Architecture excerpts:
  - `docs/ARCHITECTURE.md` §9 Domain Boundaries
  - `docs/ARCHITECTURE.md` §11 Data Flow
  - `docs/ARCHITECTURE.md` §14 Review Model
  - `docs/ARCHITECTURE.md` §15 Review Source Model
  - `docs/ARCHITECTURE.md` §16 Diff Processing Pipeline
- CLI sections:
  - `docs/CLI.md` `ringi review create`
  - `docs/CLI.md` `ringi source list`
  - `docs/CLI.md` `ringi source diff <source>`
  - `docs/CLI.md` `ringi review status`
- MCP sections:
  - `docs/MCP.md` `reviews`
  - `docs/MCP.md` `sources`
  - `docs/MCP.md` `session`
  - `docs/MCP.md` `Data Models`
- Code files to have open:
  - `src/routes/api/-lib/db/migrations.ts`
  - `src/api/schemas/review.ts`
  - `src/routes/api/-lib/repos/review.repo.ts`
  - `src/routes/api/-lib/repos/review-file.repo.ts`
  - `src/routes/api/-lib/services/review.service.ts`
  - `src/routes/api/-lib/services/git.service.ts`
  - `src/routes/api/-lib/services/diff.service.ts`
  - `src/routes/reviews/new.tsx`
  - `src/api/domain-api.ts`
  - `src/routes/api/$.ts`
