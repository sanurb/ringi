# 008 — CLI/MCP Service Integration

## Source Spec(s)

- SPEC-003: CLI Surface Contracts (REQ-003-006)
- SPEC-004: MCP Execute API (REQ-004-010, REQ-004-022 through REQ-004-030)
- SPEC-006: Core Service Boundaries (REQ-006-001 through REQ-006-020)

## Objective

Wire CLI commands and MCP namespace adapters to the shared service layer with one truthful runtime boundary for transactions, transport choice, and error propagation.

## Why This Slice Exists Now

005 defines how the CLI runtime decides where to send work, and 006 defines the codemode contracts that need backing services. This slice lands after both because the hard part is not new commands or namespaces; it is making every caller hit the same service truths, transaction boundaries, and error categories.

## Likely Files / Modules

- `src/routes/api/-lib/services/review.service.ts` — primary review-domain owner for creation, reads, and lifecycle entrypoints (VERIFIED TO EXIST)
- `src/routes/api/-lib/services/comment.service.ts` — comment and suggestion reads/mutations used by CLI and MCP review flows (VERIFIED TO EXIST)
- `src/routes/api/-lib/services/export.service.ts` — snapshot-backed export composition service (VERIFIED TO EXIST)
- `src/routes/api/-lib/wiring/reviews-api-live.ts` — current HTTP adapter wiring to refactor toward honest service encapsulation (VERIFIED TO EXIST)
- `src/runtime/` — shared builders for standalone CLI read runtime, server-connected CLI transport, and MCP runtime service graphs (NEEDS CREATION)

## Implementation Order

1. Build shared runtime constructors that expose services, not repos, to CLI and MCP adapters.
2. Keep standalone CLI reads on a read-capable local runtime and route server-connected CLI mutations through `DomainApi` only.
3. Connect MCP namespace adapters directly to the same services used by HTTP and CLI; do not mirror review-only RPC naming into codemode.
4. Move transaction ownership to service boundaries for multi-repository mutations and remove adapter knowledge of repo internals.
5. Preserve error categories end-to-end so CLI can map exit codes truthfully and MCP can return human-readable `execute` failures without flattening domain versus adapter errors.
6. Keep export, diff, and review status reads snapshot-anchored so all surfaces inspect the same persisted review truth.

## Dependency Notes

005 and 006 must both exist first. 008 is the cutover point where runtime builders, services, and adapters stop drifting, so 009 should not start until this integration slice is stable.

## Risks

- Letting adapters keep direct repo knowledge would preserve the service-encapsulation leak called out by SPEC-006.
- Reusing review-only RPC naming in MCP would reintroduce a shadow transport model under the codemode contract.
- Error flattening will make CLI exit codes and MCP failures plausible-looking lies instead of truthful diagnostics.

## Validation Strategy

Add integration tests proving CLI standalone reads, CLI server-connected mutations, and MCP namespace calls all hit the same services; include transaction-boundary tests and adapter-failure versus domain-failure mapping checks.

## Acceptance Criteria

- [ ] CLI and MCP adapters depend on shared runtime/service builders rather than raw repos or duplicated orchestration.
- [ ] Server-connected CLI mutations use `DomainApi`, while standalone CLI reads stay local and read-only.
- [ ] MCP namespace methods call the same core services as HTTP/CLI and preserve snapshot anchoring.
- [ ] Service-boundary transactions and error categories remain intact across CLI and MCP adapters.

## Context Pack

Load these files and NOTHING else for the implementation session:

- `docs/implementation/008-cli-mcp-service-integration.md`
- `docs/specs/core-service-boundaries.md` (REQ-006-001 through REQ-006-020 only)
- `docs/implementation/005-cli-runtime-model.md`
- `docs/implementation/006-codemode-namespace-contracts.md`
- `src/routes/api/-lib/services/review.service.ts`
