# 006 — Codemode Namespace Contracts

## Source Spec(s)

SPEC-004: MCP Execute API (REQ-004-009 through REQ-004-030)

## Objective

Define one typed adapter module per MCP namespace so sandbox code talks to explicit service-backed contracts instead of leaking transport names, raw services, or undocumented return shapes.

## Why This Slice Exists Now

004 defined one `execute` tool and the canonical namespace vocabulary, but it intentionally stopped short of specifying the per-namespace adapter modules that make the tool implementable. This slice comes next so the sandbox can inject stable contracts and later runtime work can classify readonly and mutating methods without guessing.

## Likely Files / Modules

- `src/routes/api/-lib/services/review.service.ts` — backing service for `reviews` reads and lifecycle-safe mutations (VERIFIED TO EXIST)
- `src/routes/api/-lib/services/todo.service.ts` — backing service for `todos` CRUD and ordering (VERIFIED TO EXIST)
- `src/routes/api/-lib/services/event.service.ts` — backing service for `events` subscriptions and watcher-facing fanout (VERIFIED TO EXIST)
- `src/routes/api/-lib/services/git.service.ts` — source discovery and diff preview backing for `sources` and `session` context (VERIFIED TO EXIST)
- `src/mcp/namespaces/` — typed namespace adapters for `reviews`, `todos`, `sources`, `intelligence`, `events`, and `session` (NEEDS CREATION)

## Implementation Order

1. Create one adapter module per canonical namespace: `reviews`, `todos`, `sources`, `intelligence`, `events`, and `session`; do not revive the superseded `exports` namespace.
2. Encode the documented method signatures and return shapes as adapter-owned TypeScript contracts, including explicit phase-unavailable errors where services do not exist yet.
3. Classify every method as readonly or mutating at the adapter layer so readonly rejection can happen before service calls.
4. Map public MCP names onto current service names where they differ, especially `todos.add|done|undone|clear`, `reviews.get|getFiles|getDiff|getStatus|export`, and `sources.previewDiff`.
5. Resolve return-shape mismatches as full cutover items, most notably `todos.move`, instead of normalizing two parallel representations.
6. Keep truncation eligibility and error translation adapter-owned so namespace methods return truthful data and the outer runtime can serialize consistently.

## Dependency Notes

004 must already be accepted as the external MCP contract. 006 should land before sandbox runtime work because 007 needs a concrete namespace surface to inject and a mutating-method map to enforce readonly mode.

## Risks

- Namespace drift will reappear if method signatures are inferred from current services instead of the documented MCP contract.
- Shipping both `sources` and `exports` vocabulary would create two truths for the same concept.
- Phase-unavailable capabilities are easy to fake with empty success payloads, which would lie to agents.

## Validation Strategy

Add contract tests per namespace for method presence, readonly classification, error shapes, and service mapping; include explicit failure tests for phase-unavailable intelligence and unresolved `todos.move` return-shape drift.

## Acceptance Criteria

- [ ] Adapter modules exist for `reviews`, `todos`, `sources`, `intelligence`, `events`, and `session` only.
- [ ] Each namespace exposes the documented MCP method names and maps to shared services without raw repository or transport leakage.
- [ ] Readonly-versus-mutating classification is explicit per method and adapter-owned.
- [ ] Known contract mismatches such as `todos.move` are resolved or rejected explicitly, not normalized silently.

## Context Pack

Load these files and NOTHING else for the implementation session:

- `docs/implementation/006-codemode-namespace-contracts.md`
- `docs/specs/mcp-execute-api.md` (REQ-004-009 through REQ-004-030 only)
- `src/routes/api/-lib/services/review.service.ts`
- `src/routes/api/-lib/services/todo.service.ts`
- `src/routes/api/-lib/services/git.service.ts`
