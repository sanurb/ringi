# AGENTS.md

**Generated:** 2026-03-26 | **Commit:** f037748 | **Branch:** main

## Overview

Ringi — local-first human review workbench for AI-generated code. pnpm monorepo: shared core (Effect services + SQLite), TanStack Start web app, CLI + MCP server.

## Structure

```
ringi/
├── packages/core/     # @ringi/core — schemas, services, repos, db, API defs
├── apps/web/          # @ringi/web — TanStack Start (routes, components, UI)
├── apps/cli/          # @ringi/cli — CLI parser + MCP stdio server (npm pkg)
├── docs/              # Architecture, monorepo, CLI, MCP, release docs
├── docs/specs/        # Feature specs
└── skills/ringi/rules/# User-facing CLI command docs
```

## Task Completion Requirements

All of `pnpm check`, `pnpm fix`, and `pnpm typecheck` must pass before considering tasks completed.

## Testing Policy

- Mocking frameworks are **banned**. No `vi.mock()`, `vi.stubGlobal()`, `vi.spyOn()`.
- Tests use stub or constructor/parameter dependency injection.

## Where to Look

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

## Dependency Rules

1. `packages/core` has **zero** workspace dependencies.
2. Both apps depend on `@ringi/core` via `workspace:*`.
3. Apps **never** depend on each other.
4. Import pattern: `import { X } from "@ringi/core/services/review.service"`.
5. Each app uses `@/` alias → own `src/`.

## Conventions

- **Effect v4** everywhere: `Effect.gen`, `Schema.TaggedError`, `Schema.Class`, branded IDs, Layer composition.
- **No mocks** — stub injection only.
- **SQLite** via `node:sqlite` (Node built-in), WAL mode, `DatabaseSync`.
- **Vite+** (`vp`) unified toolchain: lint (oxlint), format (oxfmt), test (vitest), check, staged hooks.
- **tsdown** bundles CLI; TanStack Start/Vite bundles web.
- CLI outputs RFC 9457-inspired JSON envelopes with HATEOAS `nextActions`.

## Anti-Patterns

- Do NOT use `vi.mock()` / `vi.spyOn()` — tests will be rejected.
- Do NOT create granular packages (`packages/git`, `packages/db`) — extract to core only when ≥2 consumers exist.
- Do NOT add full-repo indexing or persistent knowledge graphs — intelligence is review-scoped.
- Do NOT auto-apply code changes from suggestions.
- Do NOT treat HTML as trusted in evidence/provenance rendering.

## Commands

```bash
pnpm dev          # Web dev server (port 3000)
pnpm dev:cli      # CLI dev mode via tsx
pnpm build        # Build web
pnpm build:cli    # Build CLI (tsdown)
pnpm build:all    # CLI then web
pnpm test         # Tests (vp test run — unified vitest across workspaces)
pnpm typecheck    # Typecheck all workspaces
pnpm check        # Lint + format check (vp check — oxlint + oxfmt)
pnpm fix          # Auto-fix lint + format (vp check --fix)
```

## Core Priorities

1. Performance first.
2. Reliability first.
3. Correctness and robustness over short-term convenience.

## Notes

- VERY EARLY WIP — sweeping improvements encouraged.
- CI: Node 22+24 matrix, typecheck → check → test → build:cli → smoke test.
- Review model: `created → analyzing → ready → in_review → approved/changes_requested → exported`.
- Three operational modes: standalone CLI (read-only), server-connected (full), MCP stdio (agent).

## Learning more about the "effect" & "@effect/\*" packages

`~/.local/share/ai-references/effect/v4/LLMS.md` is an authoritative source of information about the
"effect" and "@effect/\*" packages. Read this before looking elsewhere for
information about these packages. It contains the best practices for using
effect.

Use this for learning more about the library, rather than browsing the code in
`node_modules/`.
