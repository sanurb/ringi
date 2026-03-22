# 009 — CLI/MCP Event Hooks

## Source Spec(s)

- SPEC-007: Events and Realtime (REQ-007-001 through REQ-007-041)
- SPEC-003: CLI Surface Contracts (REQ-003-015)
- SPEC-004: MCP Execute API (REQ-004-026)

## Objective

Implement the shared realtime layer for CLI event tailing, MCP event access, SSE fanout, and watcher-backed publication without inventing a second event model.

## Why This Slice Exists Now

Realtime is downstream of runtime and service integration, not a prerequisite for them. This slice comes last because watcher boot, SSE transport, and MCP event exposure are only safe once 008 has stabilized runtime construction, service ownership, and post-commit publication boundaries.

## Likely Files / Modules

- `src/routes/api/-lib/services/event.service.ts` — event fanout, subscriber queues, and watcher integration owner (VERIFIED TO EXIST)
- `src/routes/api/-lib/wiring/events-api-live.ts` — current HTTP event wiring and coarse event transport surface (VERIFIED TO EXIST)
- `src/routes/api/$.ts` — SSE endpoint and server boot location for watcher startup (VERIFIED TO EXIST)
- `src/routes/-shared/hooks/use-event-source.ts` — current reconnect behavior reference for SSE consumers (VERIFIED TO EXIST)
- `src/cli/events.ts` — CLI tail/follow adapter over the shared SSE/event contract (NEEDS CREATION)

## Implementation Order

1. Start the watcher during server runtime boot only after repository resolution and runtime initialization succeed; document degraded behavior conservatively until watcher failure policy is resolved.
2. Cut the wire envelope over to one canonical event shape shared by SSE and MCP, then update HTTP/SSE serialization from that source.
3. Add disconnect cleanup, subscriber accounting, and bounded recent-event buffering needed for `events.listRecent(...)`.
4. Implement MCP `events.subscribe(...)` and `events.listRecent(...)` against the shared event model, with execute-call-scoped subscription lifetime.
5. Add CLI event tailing over the SSE contract used by the UI instead of inventing a CLI-only event transport.
6. Keep reconnect and replay claims conservative: best-effort reconnect, no durable replay, and explicit handling for the current buffer gap.

## Dependency Notes

008 must be complete first because event publication must hang off the real runtime and service graph. 009 should stay conservative around unresolved watcher boot policy and the current `events.listRecent` implementation gap instead of expanding the contract.

## Risks

- Wiring watcher logic before runtime stabilization will create a third startup path with different failure behavior.
- Subscriber leaks remain likely until SSE disconnect cleanup is fixed.
- Promising replay semantics without a durable buffer would be a contract lie.

## Validation Strategy

Add tests for watcher startup wiring, SSE frame shape, disconnect cleanup, recent-buffer reads, execute-scoped MCP subscriptions, and CLI reconnect behavior against a live local SSE stream.

## Acceptance Criteria

- [ ] Server boot wires watcher startup, SSE fanout, and disconnect cleanup through `EventService`.
- [ ] SSE, MCP `events`, and CLI tailing share one canonical event envelope and vocabulary.
- [ ] `events.listRecent(...)` uses a bounded recent-event buffer and does not synthesize by polling review/todo/comment services.
- [ ] Reconnect and replay behavior are documented and implemented conservatively as best-effort only.

## Context Pack

Load these files and NOTHING else for the implementation session:

- `docs/implementation/009-cli-mcp-event-hooks.md`
- `docs/specs/events-realtime.md` (REQ-007-001 through REQ-007-041 only)
- `docs/implementation/008-cli-mcp-service-integration.md`
- `src/routes/api/-lib/services/event.service.ts`
- `src/routes/api/$.ts`
