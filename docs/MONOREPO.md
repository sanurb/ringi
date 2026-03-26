# Monorepo Structure

Ringi is organized as a **pnpm workspace monorepo** with three packages.

## Layout

```
ringi/
├── apps/
│   ├── web/              # TanStack Start web app (UI, SSR, API routes)
│   └── cli/              # CLI + MCP server (publishable npm package)
├── packages/
│   └── core/             # Shared business logic, schemas, services
├── package.json          # Root workspace (scripts, shared dev deps)
├── pnpm-workspace.yaml   # Workspace definition
├── tsconfig.base.json    # Shared TypeScript compiler options
└── tsconfig.json         # Project references root
```

## Packages

### `packages/core` (`@ringi/core`)

The shared foundation used by both apps. Contains:

- **`schemas/`** — Effect Schema definitions (review, comment, todo, diff, git). These are the contract boundary between all surfaces.
- **`services/`** — Business logic services (review, comment, todo, git, diff, event, export).
- **`repos/`** — SQLite repository layer.
- **`db/`** — Database setup, migrations.
- **`api/`** — HTTP API (`domain-api.ts`) and RPC (`domain-rpc.ts`) definitions.
- **`runtime.ts`** — Shared Effect Layer composition (`CoreLive`).

**Why extracted:** This code is genuinely used by three consumers (web API routes, CLI commands, MCP server). Extracting it prevents accidental coupling and makes the shared boundary explicit.

**Import pattern:** `import { ReviewService } from "@ringi/core/services/review.service"`

### `apps/web` (`@ringi/web`)

The TanStack Start web application. Contains:

- **`routes/`** — File-based routes (pages + API handlers).
- **`components/`** — React components (UI primitives, review components, settings).
- **`lib/`** — Client-side utilities (themes, formatting, drafts).
- **`hooks/`** — React hooks.
- **`api/`** — Browser-side API client (`api-client.ts`).
- **`styles/`** — CSS and theme palettes.

### `apps/cli` (`@ringi/cli`)

The CLI and MCP server, bundled via tsup into a publishable npm package. Contains:

- **`cli/`** — CLI parser, commands, contracts, runtime.
- **`mcp/`** — MCP stdio server, sandbox, code execution engine.

## Dependency Rules

1. `packages/core` has **zero** internal workspace dependencies.
2. Both `apps/web` and `apps/cli` depend on `@ringi/core` via `workspace:*`.
3. Apps never depend on each other.
4. Shared dev tooling (vite-plus, tsdown, typescript) lives in root `devDependencies`.

## Commands

| Command          | Description                      |
| ---------------- | -------------------------------- |
| `pnpm dev`       | Start web dev server (port 3000) |
| `pnpm dev:cli`   | Run CLI in dev mode via tsx      |
| `pnpm build`     | Build web app                    |
| `pnpm build:cli` | Build CLI + MCP (tsdown)         |
| `pnpm build:all` | Build CLI then web               |
| `pnpm test`      | Run tests across all workspaces  |
| `pnpm typecheck` | Typecheck all workspaces         |
| `pnpm check`     | Lint + format check (vp check)   |
| `pnpm fix`       | Auto-fix lint + format issues    |

## When to Extract a New Package

Apply **YAGNI rigorously**. Extract code into `packages/` only when:

1. **Real reuse exists today** — the code is imported by ≥2 apps, not "might be useful someday."
2. **Strong architectural pressure** — e.g., a package has a fundamentally different dependency profile (Node-only vs browser-only) and mixing causes build/type issues.
3. **Independent versioning is needed** — the package ships separately (like the CLI).

Do **not** create granular packages (e.g., `packages/git`, `packages/db`, `packages/events`) unless one of the above conditions is clearly met. Prefer keeping logic inside `apps/web` or `apps/cli` and extracting to `packages/core` only when a second consumer appears.
