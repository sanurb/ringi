# 007 — Codemode Sandbox Runtime

## Source Spec(s)

SPEC-004: MCP Execute API (REQ-004-008, REQ-004-010 through REQ-004-012, REQ-004-016 through REQ-004-021, REQ-004-031 through REQ-004-035)

## Objective

Implement the isolated JavaScript runtime behind `execute({ code, timeout? })`, including namespace injection, timeout control, serialization, truncation, and fail-closed sandbox boundaries.

## Why This Slice Exists Now

006 defines what gets injected into codemode, but it does not define how untrusted JavaScript is contained. This slice follows immediately so the runtime can enforce isolation, timeout, and truncation once against a known namespace contract instead of spreading those controls across adapters.

## Likely Files / Modules

- `src/api/domain-rpc.ts` — current review-only transport surface that must stay outside the sandbox boundary (VERIFIED TO EXIST)
- `src/routes/api/-lib/wiring/reviews-rpc-live.ts` — current runtime wiring reference for review-backed execution paths (VERIFIED TO EXIST)
- `src/routes/api/-lib/wiring/reviews-api-live.ts` — current HTTP-side wiring reference for service access (VERIFIED TO EXIST)
- `src/routes/api/-lib/services/event.service.ts` — subscription lifecycle reference for per-execute isolation (VERIFIED TO EXIST)
- `src/mcp/runtime/execute-sandbox.ts` — isolated JS runtime, timeout, truncation, and serialization owner (NEEDS CREATION)

## Implementation Order

1. Choose one sandbox mechanism that can support async code and top-level `await` while still failing closed; document the choice and its escape surface before coding.
2. Create a fresh execution context per `execute` call and inject frozen namespace objects only.
3. Deny filesystem, network, process, module loading, and mutable host globals by construction rather than by best-effort patching.
4. Clamp timeout to the documented default and max, abort execution on expiry, and report timeout as inconclusive failure.
5. Serialize returned values once at the adapter boundary, apply the 100KB budget, and set `truncated: true` whenever bytes are dropped.
6. Ensure concurrent calls share no sandbox memory, subscriptions, or mutable adapter state beyond normal service-layer write coordination.

## Dependency Notes

006 must land first because the sandbox should inject real namespace adapters, not ad hoc mocks. 007 should finish before service integration and events work so every future MCP path runs through one containment model.

## Risks

- Picking a sandbox with weak isolation turns readonly and namespace controls into security theater.
- Timeout handling can lie if the runtime reports domain success after execution was cut off.
- Silent truncation would violate the MCP contract and make agent decisions untrustworthy.

## Validation Strategy

Add runtime tests for invalid JS, thrown exceptions, escape attempts, top-level `await`, timeout clamp behavior, explicit truncation, and concurrent isolated executes with both readonly and mutating paths.

## Acceptance Criteria

- [ ] Every `execute` call runs in a fresh isolated context with only the documented namespaces injected.
- [ ] Host capabilities are unavailable and sandbox escape attempts fail closed.
- [ ] Timeout defaults, max clamp, timeout failures, and 100KB truncation behavior match SPEC-004.
- [ ] Concurrent execute calls remain isolated while preserving normal shared-service write coordination.

## Context Pack

Load these files and NOTHING else for the implementation session:

- `docs/implementation/007-codemode-sandbox-runtime.md`
- `docs/specs/mcp-execute-api.md` (REQ-004-008, REQ-004-010 through REQ-004-012, REQ-004-016 through REQ-004-021, REQ-004-031 through REQ-004-035 only)
- `docs/implementation/006-codemode-namespace-contracts.md`
- `src/routes/api/-lib/wiring/reviews-rpc-live.ts`
- `src/routes/api/-lib/services/event.service.ts`
