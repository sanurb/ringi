# Installation

Ringi runs locally — no cloud dependency, no account required.

## Quick start

```bash
ringi serve
```

This starts the local Ringi server and opens the web interface at http://localhost:3000.

## Common options

### Custom port

```bash
ringi serve --port 4123 --no-open
```

## Requirements

- Node.js (with pnpm)
- Git repository (Ringi operates on git repos)

## Data Storage

Ringi stores all review data in `.ringi/reviews.db` (SQLite database) at the repository root. This file contains:

- All review sessions and their lifecycle state
- Inline comments and code suggestions
- Todos and their completion status
- Export audit records

**Important**: The `.ringi/` directory is not tracked by git. Back it up if you need to preserve review history.

## Operational Modes

Ringi operates in three modes:

| Mode                 | Entry            | What works                                               |
| -------------------- | ---------------- | -------------------------------------------------------- |
| **Standalone**       | Direct CLI reads | `ringi review list`, `ringi review show`, `ringi export` |
| **Server-connected** | `ringi serve`    | Full review creation, comments, todos, export, live UI   |
| **MCP stdio**        | `ringi mcp`      | Agent integration through review-scoped namespaces       |

Standalone mode requires no running server — it reads directly from `.ringi/reviews.db`. Mutations (creating reviews, adding comments/todos, resolving) require the server.

## Decision points

- If you just need to **read** existing review data (`review list/show`, `todo list`, `export`, `source diff`), you can often do it without running `ringi serve`.
- If you need to **create or mutate** review state (create reviews, add comments/todos, resolve), start `ringi serve` first.

## HTTPS and Auth (Optional)

For local network exposure:

```bash
ringi serve --https --cert ./certs/dev.crt --key ./certs/dev.key --auth --username reviewer --password local-dev
```
