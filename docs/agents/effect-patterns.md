# Effect v4 Patterns in Ringi

## Core Patterns Used

- `Effect.gen` / `Effect.fn` — generator-based composition
- `Schema.Class` — domain model definitions with branded types
- `Schema.TaggedError` / `TaggedErrorClass` — typed domain errors
- `Layer` composition — dependency wiring via `CoreLive` in `packages/core/src/runtime.ts`
- Branded IDs — `ReviewId`, `CommentId`, etc. via Effect Schema
- `HttpApi` / `HttpApiBuilder` — typed HTTP API definitions and handlers
- `@effect/rpc` — typed RPC definitions

## Service Structure

Services live in `packages/core/src/services/` and follow:

1. Define service interface with `ServiceMap.Service`
2. Implement with `Effect.gen` generators
3. Compose via Layers in `runtime.ts`
4. Consume in adapters (web routes, CLI commands, MCP handlers)

## Reference

For comprehensive Effect v4 guidance, read:
`~/.local/share/ai-references/effect/v4/LLMS.md`

This is the authoritative source — prefer it over `node_modules/` browsing.
