# Setup, Checks, and CI

## Prerequisites

- Node 22+ (CI runs 22+24 matrix)
- pnpm (workspace monorepo)

## Install

```bash
pnpm install
```

## Commands

| Command          | Description                                     |
| ---------------- | ----------------------------------------------- |
| `pnpm dev`       | Web dev server (port 3000)                      |
| `pnpm dev:cli`   | CLI dev mode via tsx                            |
| `pnpm build`     | Build web app                                   |
| `pnpm build:cli` | Build CLI (tsdown)                              |
| `pnpm build:all` | CLI then web                                    |
| `pnpm test`      | Tests (vp test run — vitest, all workspaces)    |
| `pnpm typecheck` | Typecheck all workspaces                        |
| `pnpm check`     | Lint + format check (vp check — oxlint + oxfmt) |
| `pnpm fix`       | Auto-fix lint + format (vp check --fix)         |

## Task Completion Gate

All three must pass before a task is done:

1. `pnpm check`
2. `pnpm fix`
3. `pnpm typecheck`

## CI Pipeline

CI runs in order: `typecheck → check → test → build:cli → smoke test`.

## Tooling

- **Vite+** (`vp`) — unified lint (oxlint), format (oxfmt), test (vitest), check, staged hooks.
- **tsdown** — bundles CLI.
- **TanStack Start / Vite** — bundles web.
