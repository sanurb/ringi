# 004: MCP Execute API

**Source Spec:** `docs/specs/mcp-execute-api.md`
**Status:** queued

## Objective

Implement the MCP surface as one truthful `execute({ code, timeout? })` tool backed by review-scoped namespaces over the shared service layer. This unit fixes the current gap between the documented codemode contract and the review-only transport/runtime pieces that exist today.

Note: The canonical MCP namespace set is defined in SPEC-004 §Namespaces. If architecture docs reference an older namespace vocabulary (e.g., `exports` instead of `sources`), SPEC-004 takes precedence.

## Why Now

SPEC-004 depends on lifecycle truth from SPEC-001 because MCP reads and mutations must operate on anchored review state, not legacy status shortcuts. It follows CLI contract work because both surfaces need the same honest service boundaries and transport naming.

## Likely Files

- `src/api/domain-rpc.ts`
- `src/routes/api/$.ts`
- `src/routes/api/-lib/wiring/reviews-rpc-live.ts`
- `src/routes/api/-lib/wiring/reviews-api-live.ts`
- `src/routes/api/-lib/wiring/todos-api-live.ts`
- `src/routes/api/-lib/wiring/events-api-live.ts`
- No dedicated `ringi mcp` bootstrap file was found under `src/`; verify before loading any CLI/bootstrap entrypoint outside `src/`.
- `src/routes/api/-lib/services/review.service.ts`
- `src/routes/api/-lib/services/todo.service.ts`
- `src/routes/api/-lib/services/comment.service.ts`
- `src/routes/api/-lib/services/export.service.ts`
- `src/routes/api/-lib/services/event.service.ts`
- `src/routes/api/-lib/services/git.service.ts`
- `src/api/domain-api.ts`

## Implementation Order

1. Inventory the current MCP startup path and isolate the adapter boundary that should own sandbox creation, readonly enforcement, timeout handling, and truncation.
2. Implement the single `execute` transport contract and remove any competing top-level MCP tool shape instead of layering a second API beside codemode.
3. Build the injected namespace surface (`reviews`, `todos`, `sources`, `intelligence`, `events`, `session`) as adapter-owned mappings onto existing services, keeping transport naming drift out of the core domain.
4. Add adapter-level readonly rejection for mutating namespace calls before they touch storage or write-capable services.
5. Add consistent timeout clamping and output truncation behavior, including explicit `truncated: true` signaling and human-readable timeout/readonly errors.
6. Cut review-backed namespace methods over to anchored lifecycle-safe service calls, especially review reads, review creation, todo mutations, export, and status reporting.
7. Add concurrency and failure coverage for invalid JS, missing namespace methods, readonly rejection, timeout, truncation, and parallel read execution.

## Dependency Notes

Requires SPEC-001 lifecycle cutover and benefits from SPEC-003 transport cleanup because MCP should not invent different review truths than CLI or HTTP. It unblocks later realtime, provenance, and intelligence work that assumes a stable codemode adapter.

## Risks

- Namespace names and return shapes can drift from `docs/MCP.md` if adapter mapping is not centralized.
- Readonly mode is easy to fake badly by relying on downstream services instead of rejecting at the adapter boundary.
- Timeout handling can leave callers with ambiguous partial mutations if execution and domain writes are not clearly bounded.
- Truncation can become silent data loss if the adapter shortens payloads without the contract flag.
- `todos.move` already appears mismatched between docs and implementation, so return-shape drift is a concrete risk.

## Test & Validation Strategy

- MCP adapter tests for `execute` input/output shape, timeout default/clamp behavior, and explicit truncation signaling.
- Sandbox tests proving only the documented namespaces are present and host capabilities are unavailable.
- Readonly tests proving mutating calls fail before hitting write paths.
- Namespace contract tests for `reviews`, `todos`, `sources`, `events`, and `session`, with adapter-mapping assertions where current service names differ.
- Concurrency tests for parallel read executions and serialized mutation behavior through the existing runtime/storage path.
- Lifecycle anchoring tests proving MCP diff reads and exports use persisted review state rather than live git.

## Acceptance Criteria

- [ ] MCP exposes exactly one top-level tool: `execute({ code, timeout? })`.
- [ ] The sandbox injects only the documented namespaces and does not expose host capabilities.
- [ ] Readonly mode rejects mutating namespace calls at the adapter boundary with the documented error shape.
- [ ] Timeout and truncation behavior are consistent, explicit, and covered by tests.
- [ ] Namespace methods map to shared services without introducing a shadow review model.
- [ ] MCP review reads respect snapshot anchoring and lifecycle-safe review truth.
- [ ] Tests cover invalid code, missing methods, readonly rejection, truncation, timeout, and concurrent execution behavior.

## Context Pack

Exact files and sections to load when this becomes the active spec:

- Spec file: `docs/specs/mcp-execute-api.md`
- Architecture excerpts:
  - `docs/ARCHITECTURE.md` §8 Core Runtime Model
  - `docs/ARCHITECTURE.md` §9 Domain Boundaries
  - `docs/ARCHITECTURE.md` §18 Agent Integration Strategy
  - `docs/ARCHITECTURE.md` §19 CLI / Server / Web UI / MCP Relationship
- MCP sections:
  - `docs/MCP.md` Overview
  - `docs/MCP.md` `Starting the MCP Server`
  - `docs/MCP.md` `The Execute Tool`
  - `docs/MCP.md` `API Surface`
  - `docs/MCP.md` `Error Handling`
  - `docs/MCP.md` `Read-Only vs Mutating Operations`
  - `docs/MCP.md` `Limitations`
- CLI sections:
  - `docs/CLI.md` Operational Modes
  - `docs/CLI.md` `ringi mcp`
- Code files to have open:
  - `src/api/domain-rpc.ts`
  - `src/routes/api/$.ts`
  - `src/routes/api/-lib/wiring/reviews-rpc-live.ts`
  - `src/routes/api/-lib/wiring/reviews-api-live.ts`
  - `src/routes/api/-lib/wiring/todos-api-live.ts`
  - `src/routes/api/-lib/wiring/events-api-live.ts`
  - No dedicated `ringi mcp` bootstrap file was found under `src/`; verify before loading any CLI/bootstrap entrypoint outside `src/`.
  - `src/routes/api/-lib/services/review.service.ts`
  - `src/routes/api/-lib/services/todo.service.ts`
  - `src/routes/api/-lib/services/comment.service.ts`
  - `src/routes/api/-lib/services/export.service.ts`
  - `src/routes/api/-lib/services/event.service.ts`
  - `src/routes/api/-lib/services/git.service.ts`
  - `src/api/domain-api.ts`
  - `src/routes/api/$.ts`
