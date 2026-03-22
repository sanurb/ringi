# 005 — CLI Runtime Model

## Source Spec(s)

SPEC-003: CLI Surface Contracts (REQ-003-003 through REQ-003-011)

## Objective

Make the documented CLI surface actually executable by defining one runtime model for entrypoint boot, argument parsing, mode resolution, transport selection, repository discovery, and exit-code truth.

## Why This Slice Exists Now

003 fixed what the CLI is allowed to promise, but it still does not define how the process starts or how commands choose standalone versus server-connected execution. This slice lands next so later CLI and MCP work can reuse one honest runtime bootstrap instead of inventing parallel startup paths.

## Likely Files / Modules

- `package.json` — declare the `ringi` bin entry and runtime script hooks (VERIFIED TO EXIST)
- `src/api/domain-api.ts` — canonical server-connected CLI transport contract (VERIFIED TO EXIST)
- `src/routes/api/-lib/services/review.service.ts` — standalone read runtime consumer for review commands (VERIFIED TO EXIST)
- `src/routes/api/-lib/services/todo.service.ts` — standalone read runtime consumer for todo reads (VERIFIED TO EXIST)
- `src/cli/index.ts` — CLI bootstrap, parser, mode resolver, and process exit ownership (NEEDS CREATION)

## Implementation Order

1. Add one CLI bootstrap entrypoint and register it in `package.json`; do not scatter command startup across ad hoc files.
2. Build argument parsing around the canonical command taxonomy from 003 and reject deprecated or invalid flag combinations before transport setup.
3. Implement repository discovery as `--repo` override, then CWD, then git-root resolution, then `.ringi/reviews.db` lookup.
4. Resolve mode from the command contract, not from server availability: standalone for documented reads, server-connected for mutations, runtime-startup for `serve` and `mcp`.
5. Wire standalone reads to an in-process read-only runtime and server-connected calls to `DomainApi`; never fall back from failed server mutations to local writes.
6. Centralize stdout/stderr rendering, JSON envelope serialization, and exit code mapping `0/2/3/4/5/1` in one process-level error pipeline.

## Dependency Notes

003 must already be treated as canonical. 005 should finish before any command-specific implementation because every CLI slice needs the same bootstrap, repository resolution, and exit semantics.

## Risks

- Bootstrapping writes in standalone mode would violate REQ-003-005 even if commands appear to work.
- Repo discovery can lie if git-root resolution and `.ringi/reviews.db` lookup are split across multiple helpers.
- Exit codes drift fast when parse, transport, and domain failures are mapped in different layers.

## Validation Strategy

Add CLI runtime tests for mode resolution, repository discovery, JSON envelope rendering, and exit-code mapping; then run focused command smoke tests proving standalone reads stay local and mutations fail fast without a server.

## Acceptance Criteria

- [ ] One CLI entrypoint owns arg parsing, repo discovery, mode resolution, and process exit behavior.
- [ ] Standalone reads use a read-only in-process runtime and never mutate local state.
- [ ] Mutating commands require `DomainApi` server connectivity and never fall back to direct SQLite writes.
- [ ] Stdout/stderr separation, JSON envelopes, and exit codes match REQ-003-008 through REQ-003-011.

## Context Pack

Load these files and NOTHING else for the implementation session:

- `docs/implementation/005-cli-runtime-model.md`
- `docs/specs/cli-surface-contracts.md` (REQ-003-003 through REQ-003-011 only)
- `package.json`
- `src/api/domain-api.ts`
- `src/routes/api/-lib/services/review.service.ts`
