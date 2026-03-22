# 003: CLI Surface Contracts

**Source Spec:** `docs/specs/cli-surface-contracts.md`
**Status:** queued

## Objective

Make the `ringi` CLI an honest adapter over shared services instead of a drifting shell around partial transports. This unit defines the canonical command set, mode selection rules, lifecycle-safe mutations, and output/error contracts that scripts and humans can rely on.

## Why Now

SPEC-003 depends on lifecycle truth from SPEC-001 because `review resolve`, export gating, and status reporting must operate on the new review model. It should land before deeper persistence or service-boundary work so adapter semantics stop drifting while core contracts are still changing.

## Likely Files

- `src/api/domain-api.ts`
- `src/api/domain-rpc.ts`
- `src/api/schemas/review.ts`
- `src/api/schemas/todo.ts`
- `src/routes/api/-lib/services/review.service.ts`
- `src/routes/api/-lib/services/todo.service.ts`
- `src/routes/api/-lib/services/comment.service.ts`
- `src/routes/api/-lib/services/export.service.ts`
- No dedicated CLI entrypoint exists in `src/` today; verify paths exist before loading: `src/index.ts`, `src/cli/index.ts`, `src/commands/index.ts`
- `src/routes/api/$.ts`

## Implementation Order

1. Inventory the actual CLI entrypoints and map each command to standalone, server-connected, or runtime-startup mode; delete any undocumented fallback behavior.
2. Align command taxonomy with SPEC-003: canonicalize `review` and `todo` verbs, confine deprecated aliases to explicit compatibility shims if they still exist, and keep them out of help output.
3. Make `DomainApi` the canonical server-connected CLI transport for review, todo, export, and runtime workflows; stop treating `DomainRpc` as the CLI contract.
4. Replace generic review-status mutations with lifecycle-safe CLI orchestration for `review resolve` and export-related behavior.
5. Fill service/transport gaps surfaced by the command matrix, especially explicit todo state transitions, move semantics, and any export/status reads the CLI needs.
6. Standardize stdout/stderr separation, JSON envelope rendering, exit-code mapping, and non-TTY confirmation rules across command families.
7. Add focused CLI coverage for mode selection, alias deprecation, lifecycle-aware mutations, and error-category truthfulness.

## Dependency Notes

Requires SPEC-001 lifecycle cutover first. It unblocks stable transport assumptions for MCP, persistence ownership, and any future docs or automation that treat the CLI as a durable contract.

## Risks

- Verb renaming can break existing users if compatibility aliases disappear too early.
- Silent fallback to local write paths would violate the spec even if commands appear to keep working.
- `DomainRpc` is review-only today, so using it as the CLI contract guarantees feature holes for todos, export, and runtime commands.
- Confirmation behavior can corrupt pipelines if non-TTY rules are inconsistent.
- Status output can stay misleading if lifecycle projection is not fully wired before adapter rendering.

## Test & Validation Strategy

- Command-contract tests for canonical verbs, deprecated alias warnings, and help/completion output.
- Mode-resolution tests proving standalone reads stay local and mutations fail fast without a reachable server.
- CLI integration tests for `review list/show/export/status`, `review resolve`, and the canonical todo verbs.
- Output tests covering human mode, `--json` envelope shape, stderr diagnostics, and stable exit codes.
- Non-TTY tests proving destructive or approval-significant commands require `--yes` instead of prompting.

## Acceptance Criteria

- [ ] CLI command families and help output use the canonical verb set from SPEC-003.
- [ ] Server-connected CLI mutations use `DomainApi`, not review-only RPC shortcuts.
- [ ] Standalone reads work without a running server and do not mutate local state.
- [ ] `review resolve` is lifecycle-safe orchestration, not a raw status patch.
- [ ] Stdout/stderr behavior, JSON envelopes, and exit codes match the documented contract.
- [ ] Non-interactive confirmation rules are enforced consistently for destructive or approval-significant commands.
- [ ] Tests cover mode honesty, alias handling, lifecycle-safe review commands, and output/error contracts.

## Context Pack

Exact files and sections to load when this becomes the active spec:

- Spec file: `docs/specs/cli-surface-contracts.md`
- Architecture excerpts:
  - `docs/ARCHITECTURE.md` §8 Core Runtime Model
  - `docs/ARCHITECTURE.md` §10 Component Architecture
  - `docs/ARCHITECTURE.md` §19 CLI / Server / Web UI / MCP Relationship
- CLI sections:
  - `docs/CLI.md` Overview
  - `docs/CLI.md` Input/Output Conventions
  - `docs/CLI.md` Operational Modes
  - `docs/CLI.md` `ringi review create`
  - `docs/CLI.md` `ringi review resolve <id>`
  - `docs/CLI.md` `ringi todo add`
  - `docs/CLI.md` `ringi todo move <id>`
  - `docs/CLI.md` `ringi mcp`
- MCP sections:
  - `docs/MCP.md` `Starting the MCP Server`
  - `docs/MCP.md` `Read-Only vs Mutating Operations`
- Code files to have open:
  - `src/api/domain-api.ts`
  - `src/api/domain-rpc.ts`
  - `src/api/schemas/review.ts`
  - `src/api/schemas/todo.ts`
  - `src/routes/api/-lib/services/review.service.ts`
  - `src/routes/api/-lib/services/todo.service.ts`
  - `src/routes/api/-lib/services/comment.service.ts`
  - `src/routes/api/-lib/services/export.service.ts`
  - `src/routes/api/$.ts`
  - No dedicated CLI entrypoint exists in `src/` today; verify paths exist before loading: `src/index.ts`, `src/cli/index.ts`, `src/commands/index.ts`
