# apps/cli

CLI + MCP stdio server (`@ringi/cli`). Published to npm as `@sanurb/ringi`. Bundled via tsup.

## Structure

```
src/
├── cli/          # CLI parser, commands, contracts, runtime
│   ├── parser.ts       # Hand-rolled arg parser (no framework)
│   ├── commands.ts     # Command implementations
│   ├── contracts.ts    # Agent-first JSON envelope types (RFC 9457-inspired)
│   ├── main.ts         # Entry point, command dispatch
│   ├── config.ts       # CLI configuration
│   └── runtime.ts      # Effect runtime for CLI
└── mcp/          # MCP stdio server
    ├── server.ts       # JSON-RPC stdio transport, single "execute" tool
    ├── sandbox.ts      # Sandbox global construction (6 namespaces)
    ├── execute.ts      # Code execution engine (vm)
    ├── namespaces.ts   # reviews, todos, sources, intelligence, events, session
    ├── schemas.ts      # MCP-specific schemas
    ├── config.ts       # MCP config resolution
    ├── runtime.ts      # Effect runtime for MCP
    └── errors.ts       # MCP error types
```

## Conventions

- CLI outputs **JSON envelopes** with `ok`, `data`, `error`, `nextActions` (HATEOAS).
- `ExitCode` enum in `contracts.ts` — deterministic exit codes for agent consumption.
- MCP exposes a single `execute` tool — agents send JS snippets evaluated in a sandboxed VM with namespace globals.
- MCP namespaces: `reviews`, `todos`, `sources`, `intelligence`, `events`, `session`.
- Tests use parameter/constructor DI — no mocks.

## Where to Look

| Task                     | File                                   |
| ------------------------ | -------------------------------------- |
| Add CLI command          | `cli/commands.ts` + `cli/parser.ts`    |
| Change CLI output format | `cli/contracts.ts`                     |
| Add MCP namespace        | `mcp/namespaces.ts` + `mcp/sandbox.ts` |
| Change MCP execution     | `mcp/execute.ts`                       |
| Change MCP transport     | `mcp/server.ts`                        |

## Anti-Patterns

- Do NOT use commander/yargs — parser is hand-rolled for agent-first output.
- Do NOT add business logic here — delegate to `@ringi/core` services.
- Do NOT import from `apps/web`.
