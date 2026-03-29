<img width="1831" height="512" alt="Ringi" src="https://github.com/user-attachments/assets/15dc1c53-6d40-47b1-87b9-2213cc0bb542" />

# Ringi

**Local-first human review workbench for AI-generated code**

[![npm](https://img.shields.io/npm/v/@sanurb/ringi)](https://www.npmjs.com/package/@sanurb/ringi)
[![Node](https://img.shields.io/badge/node-%3E%3D22.12-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Ringi is a local-first code review tool that gives developers structured workflows for reviewing AI-generated changes. Create review sessions from real git diffs, inspect changes with machine-generated provenance and evidence, understand first-order impact without leaving the review, and drive the same review state through **Web UI**, **CLI**, or **MCP agent integration** — all backed by one shared core.

> **Early WIP** — Ringi is under active development. APIs and commands may change.

## Why Ringi?

AI coding assistants produce more code than ever, but reviewing that code still happens in ad-hoc, unstructured ways. Ringi fills the gap:

- **Review-scoped intelligence** — Provenance, evidence, grouped file trees, and confidence scores help you understand *why* a change exists, not just *what* changed.
- **Local-first by design** — All data lives in a local SQLite database (`.ringi/reviews.db`). No cloud dependency, no network required for read operations.
- **Three surfaces, one core** — Web UI for visual review, CLI for automation, and MCP stdio for AI agent integration — all sharing the same business logic and review state.
- **Agent-native from day one** — Agents create review sessions, inspect state, and react to reviewer feedback through the same domain model humans use.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                     Clients                          │
│   Web UI (TanStack Start)  ·  CLI  ·  MCP stdio     │
└──────────────┬──────────────┬──────────────┬─────────┘
               │              │              │
┌──────────────▼──────────────▼──────────────▼─────────┐
│               Transport Adapters                     │
│      HTTP/SSE  ·  CLI adapter  ·  MCP adapter        │
└──────────────────────────┬───────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────┐
│             Core Service Layer (Effect v4)            │
│  Review · Comment · Todo · Diff · Export · Event     │
│  Git · Source · Intelligence                         │
└──────────────────────────┬───────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────┐
│              Local Runtime                           │
│  SQLite (WAL mode)  ·  File Watcher  ·  Git tree    │
└──────────────────────────────────────────────────────┘
```

## Project Structure

```
ringi/
├── packages/core/     # @ringi/core — schemas, services, repos, database, API definitions
├── apps/web/          # @ringi/web — TanStack Start web app (routes, components, UI)
├── apps/cli/          # @sanurb/ringi — CLI + MCP stdio server (published to npm)
└── docs/              # Architecture, CLI reference, MCP guide, specs
```

| Package | Description |
|---------|-------------|
| `@ringi/core` | Shared business logic — Effect services, SQLite repos, schemas, API definitions |
| `@ringi/web` | TanStack Start web app with React, Tailwind CSS, Radix UI, and Shiki syntax highlighting |
| `@sanurb/ringi` | CLI binary and MCP server — the `ringi` command |

## Getting Started

### Prerequisites

- **Node.js** ≥ 22.12
- **Git** (for repository operations)

### Install

```bash
# npm
npm install -g @sanurb/ringi

# pnpm
pnpm add -g @sanurb/ringi

# or run without installing
npx @sanurb/ringi --help
```

### Quick Start

```bash
# Start the local server + web UI
ringi serve

# Create a review from staged changes
ringi review create

# Create a review from a branch diff
ringi review create --source branch --branch main

# List review sessions
ringi review list

# Show review details
ringi review show last --comments --todos

# Export a review as markdown
ringi export last --output review.md

# Check local state health
ringi doctor
```

The CLI operates in three modes:

| Mode | Description |
|------|-------------|
| **Standalone** | Read-only access to `.ringi/reviews.db` — no server needed |
| **Server-connected** | Full mutations via running `ringi serve` |
| **MCP stdio** | Agent integration via `ringi mcp` |

All commands support `--json` for machine-readable output with HATEOAS `next_actions`.

See [docs/CLI.md](docs/CLI.md) for the full command reference.

### MCP Agent Integration

Ringi exposes a single `execute` MCP tool with a constrained JavaScript sandbox:

```json
{
  "mcpServers": {
    "ringi": {
      "command": "ringi",
      "args": ["mcp", "--readonly"]
    }
  }
}
```

Agents can compose multi-step review workflows in a single call:

```js
await execute({
  code: `
    const review = await reviews.get("rev_123");
    const files = await reviews.getFiles(review.id);
    const comments = await reviews.getComments(review.id);
    return {
      status: review.status,
      fileCount: files.length,
      unresolvedComments: comments.filter(c => c.status === "open").length,
    };
  `
});
```

Available sandbox namespaces: `reviews`, `todos`, `sources`, `intelligence`, `events`, `session`.

See [docs/MCP.md](docs/MCP.md) for the full agent guide.

## Review Lifecycle

```
created → analyzing → ready → in_review → approved / changes_requested → exported
```

Reviews are anchored to immutable git snapshots with three source types:

- **Staged** — current staged index vs `HEAD`
- **Branch** — named branch compared against current branch
- **Commits** — explicit commit range or set

## Tech Stack

- **[Effect v4](https://effect.website)** — Service construction, dependency injection, typed errors, resource management
- **[TanStack Start](https://tanstack.com/start)** — Full-stack React framework with file-based routing
- **[SQLite](https://www.sqlite.org/)** — Local persistence via Node's built-in `node:sqlite` (WAL mode)
- **[Tailwind CSS](https://tailwindcss.com/) + [Radix UI](https://www.radix-ui.com/)** — UI styling and accessible components
- **[Shiki](https://shiki.style/)** — Syntax highlighting for diff rendering
- **[tsdown](https://tsdown.dev/)** — CLI bundling

## Development

For contributors working on Ringi itself:

```bash
# Clone and install
git clone https://github.com/sanurb/ringi.git
cd ringi
pnpm install

# Development
pnpm dev           # Web dev server (port 3000)
pnpm dev:cli       # CLI dev mode via tsx

# Build
pnpm build         # Build web app
pnpm build:cli     # Build CLI (tsdown)
pnpm build:all     # Build CLI + web + server assets

# Quality
pnpm test          # Run tests (vitest across workspaces)
pnpm typecheck     # Typecheck all workspaces
pnpm check         # Lint + format check (oxlint + oxfmt)
pnpm fix           # Auto-fix lint + format issues
```

## Documentation

| Document | Description |
|----------|-------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture, design principles, domain boundaries |
| [docs/CLI.md](docs/CLI.md) | Full CLI command reference with examples |
| [docs/MCP.md](docs/MCP.md) | MCP agent guide — sandbox API, usage patterns, best practices |
| [docs/MONOREPO.md](docs/MONOREPO.md) | Monorepo structure and dependency rules |
| [docs/RELEASING.md](docs/RELEASING.md) | Release process |

## Contributing

Contributions are welcome! A few things to know:

- **No mocking frameworks** — Tests use stub/constructor dependency injection. `vi.mock()`, `vi.spyOn()` are banned.
- **Effect v4 patterns** — Services use `Effect.gen`, `Schema.Class`, branded IDs, and Layer composition.
- **Check before submitting** — Run `pnpm check && pnpm typecheck && pnpm test` to validate your changes.

## License

[MIT](LICENSE) © David Urbano
