# Code Routing — Where to Put Things

| Task                      | Location                               | Notes                            |
| ------------------------- | -------------------------------------- | -------------------------------- |
| Add/change business logic | `packages/core/src/services/`          | Effect services, yield\* pattern |
| Add/change schemas        | `packages/core/src/schemas/`           | Effect Schema, branded types     |
| Add/change DB queries     | `packages/core/src/repos/`             | Raw SQLite via `node:sqlite`     |
| Add HTTP endpoint         | `packages/core/src/api/domain-api.ts`  | HttpApi definition               |
| Add RPC endpoint          | `packages/core/src/api/domain-rpc.ts`  | @effect/rpc definition           |
| Wire HTTP handler         | `apps/web/src/routes/api/-lib/wiring/` | HttpApiBuilder.group             |
| Add web route/page        | `apps/web/src/routes/`                 | TanStack Router file-based       |
| Add CLI command           | `apps/cli/src/cli/commands.ts`         | Hand-rolled parser               |
| Add MCP capability        | `apps/cli/src/mcp/`                    | Sandbox namespaces               |
| Layer composition         | `packages/core/src/runtime.ts`         | `CoreLive` + `createCoreRuntime` |
| Catch-all API route       | `apps/web/src/routes/api/$.ts`         | Mounts Effect HttpApi + RPC      |
