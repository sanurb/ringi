# packages/core

Shared foundation (`@ringi/core`) consumed by web app, CLI, and MCP server.

## Structure

```
src/
├── schemas/    # Effect Schema definitions — contract boundary for all surfaces
├── services/   # Business logic (Effect services with tagged deps)
├── repos/      # SQLite repository layer (raw SQL, node:sqlite DatabaseSync)
├── db/         # Database setup (SqliteService), migrations
├── api/        # HTTP API (domain-api.ts) + RPC (domain-rpc.ts) definitions
└── runtime.ts  # CoreLive layer composition + createCoreRuntime()
```

## Conventions

- **Schemas** define branded IDs (`Schema.brand("ReviewId")`), tagged errors (`Schema.TaggedError`), and all input/output shapes.
- **Services** use `Effect.gen` + `yield*` to pull deps. Each service is a tagged Effect service (e.g., `ReviewService`).
- **Repos** map snake_case SQLite rows → camelCase domain types. Use `db.prepare().all()` / `.run()`.
- **`withTransaction`** in `db/database.ts` wraps `BEGIN/COMMIT/ROLLBACK` via `Effect.acquireUseRelease`.
- Service errors: `Schema.TaggedError` (e.g., `ReviewNotFound`, `ReviewError`).
- `runtime.ts` merges all service + repo + db layers into `CoreLive`.

## Where to Look

| Task                            | File                                                        |
| ------------------------------- | ----------------------------------------------------------- |
| Add domain type                 | `schemas/` — create or extend a schema file                 |
| Add business operation          | `services/` — add method to existing service or new service |
| Add DB query                    | `repos/` — add method to matching repo                      |
| Add migration                   | `db/migrations.ts`                                          |
| Add HTTP endpoint definition    | `api/domain-api.ts`                                         |
| Add RPC definition              | `api/domain-rpc.ts`                                         |
| Register new service in runtime | `runtime.ts` — add to `CoreLive`                            |

## Anti-Patterns

- Do NOT import from `apps/web` or `apps/cli` — core has zero workspace deps.
- Do NOT use ORMs — raw SQL via `node:sqlite` `DatabaseSync`.
- Do NOT put transport/HTTP logic here — only domain contracts and business logic.
