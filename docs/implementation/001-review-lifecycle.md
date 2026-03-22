# 001: Review Lifecycle

**Source Spec:** `docs/specs/review-lifecycle.md`
**Status:** queued

## Objective

Replace the single `reviews.status` model with the split lifecycle contract from SPEC-001 so every surface reads the same review truth. This delivery establishes the schema, service entrypoints, and derived lifecycle projection that all later specs assume.

## Why Now

SPEC-001 is the root dependency for the implementation batch. Until lifecycle state is truthful, source anchoring, CLI behavior, export rules, and MCP contracts all rest on a lie.

## Likely Files

- `src/routes/api/-lib/db/migrations.ts`
- `src/routes/api/-lib/db/database.ts`
- `src/api/schemas/review.ts`
- `src/routes/api/-lib/repos/review.repo.ts`
- `src/routes/api/-lib/services/review.service.ts`
- `src/routes/api/-lib/services/comment.service.ts`
- `src/routes/api/-lib/services/export.service.ts`
- `src/routes/api/-lib/services/todo.service.ts`
- `src/api/domain-api.ts`
- `src/api/domain-rpc.ts`
- `src/routes/api/$.ts`

## Implementation Order

1. Add the additive review-lifecycle migration: `workflow_state`, `review_decision`, `exported_at`, `row_version`, required constraints, and any snapshot version support SPEC-001 requires.
2. Update review schemas and repo mappings so the canonical review shape exposes split lifecycle fields plus the derived lifecycle projection; stop treating `status` as the source of truth.
3. Replace generic review status mutation with explicit lifecycle operations in the review service, including CAS behavior on `row_version` and transition validation.
4. Update comment and todo mutations to trigger the lifecycle reopening rules required by SPEC-001 instead of leaving approved reviews stale.
5. Update export orchestration so export preconditions are lifecycle-safe and export recording sets terminal export facts without inventing a second review representation.
6. Cut transport surfaces over to the new contract: HTTP handlers, RPC exposure, and any route wiring must use lifecycle-safe operations only.
7. Add regression coverage for create, analyze-ready projection, reopen-on-new-work, approval, export terminal behavior, and stale-write rejection.

## Dependency Notes

This starts first and depends only on the frozen docs plus current DB state. It unblocks every later unit that needs immutable snapshot truth, lifecycle-aware CLI behavior, or MCP mutation safety.

## Risks

- Review creation can break during the schema cutover if create still writes only legacy `status`.
- Partial cutover leaves two live lifecycle representations and guarantees drift.
- CAS mistakes around `row_version` create lost updates instead of explicit conflicts.
- Comment/todo side effects can reopen reviews too often or not at all if the guard lives in the wrong layer.
- Export logic can falsely mark reviews exported without enforcing approval/export preconditions.

## Test & Validation Strategy

- Migration test: migrate an existing DB and assert new columns, defaults, constraints, and preserved legacy rows.
- Service tests for valid and invalid transitions, including stale `row_version` rejection.
- Creation-path test proving new reviews enter the post-create lifecycle shape defined by SPEC-001.
- Comment/todo mutation tests proving approved reviews reopen only under the spec-defined conditions.
- Export test proving export records terminal export facts from persisted snapshot state.
- Adapter test proving list/show/status surfaces return derived lifecycle state, not raw legacy status.

## Acceptance Criteria

- [ ] `reviews.status` is no longer the authoritative lifecycle field in schema, schemas, repos, or services.
- [ ] Review reads expose split lifecycle fields and the derived lifecycle projection required by SPEC-001.
- [ ] Generic `update(id, status)` review mutation is removed or replaced by explicit lifecycle operations.
- [ ] Approved-review reopen rules are enforced through service-level review truth, not adapter hacks.
- [ ] Export records lifecycle-safe terminal state and does not rely on live git.
- [ ] Stale lifecycle writes fail explicitly via `row_version` / compare-and-set behavior.
- [ ] Tests cover create, transition guards, reopen behavior, export behavior, and stale-write rejection.

## Context Pack

Exact files and sections to load when this becomes the active spec:

- Spec file: `docs/specs/review-lifecycle.md`
- Architecture excerpts:
  - `docs/ARCHITECTURE.md` §11 Data Flow
  - `docs/ARCHITECTURE.md` §12 Storage and Persistence Strategy
  - `docs/ARCHITECTURE.md` §14 Review Model
  - `docs/ARCHITECTURE.md` §19 CLI / Server / Web UI / MCP Relationship
- CLI sections:
  - `docs/CLI.md` `ringi review create`
  - `docs/CLI.md` `ringi review resolve <id>`
  - `docs/CLI.md` `ringi review export <id>`
  - `docs/CLI.md` `ringi review status`
- MCP sections:
  - `docs/MCP.md` `reviews`
  - `docs/MCP.md` `Data Models`
  - `docs/MCP.md` `Read-Only vs Mutating Operations`
- Code files to have open:
  - `src/routes/api/-lib/db/migrations.ts`
  - `src/api/schemas/review.ts`
  - `src/routes/api/-lib/repos/review.repo.ts`
  - `src/routes/api/-lib/services/review.service.ts`
  - `src/routes/api/-lib/services/comment.service.ts`
  - `src/routes/api/-lib/services/export.service.ts`
  - `src/routes/api/-lib/services/todo.service.ts`
  - `src/api/domain-api.ts`
  - `src/api/domain-rpc.ts`
  - `src/routes/api/$.ts`
