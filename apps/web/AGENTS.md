# apps/web

TanStack Start web application (`@ringi/web`). Vite-powered, file-based routing.

## Structure

```
src/
├── routes/                    # TanStack Router file-based routes
│   ├── __root.tsx             # Root layout
│   ├── index.tsx              # Home / review creation
│   ├── reviews/               # Review pages (list, detail, new)
│   ├── -shared/               # Shared route components (TanStack convention: - prefix)
│   │   ├── diff/              # Diff rendering (diff-file, diff-view, inline comments, suggestions)
│   │   ├── layout/            # Layout components (file-tree, action-bar, annotations-panel)
│   │   ├── annotations/       # Annotations panel + feedback formatting
│   │   ├── comments/          # Comment form, list, item
│   │   ├── todos/             # Todo panel, form, item
│   │   └── hooks/             # Route-level hooks (SSE, keyboard shortcuts)
│   └── api/
│       ├── $.ts               # Catch-all: mounts Effect HttpApi + RPC server
│       └── -lib/wiring/       # HttpApiBuilder handler implementations
├── components/
│   ├── ui/                    # Primitives (button, dialog, select, code-block, tree)
│   └── review/                # Review-specific components
│       └── settings/          # Settings modal, app settings
├── lib/                       # Client utilities
│   ├── theme/                 # Theme palettes, preferences, document sync
│   ├── client-runtime.ts      # Browser-side Effect runtime
│   ├── session-draft.ts       # Draft recovery (localStorage)
│   └── format-review-feedback.ts
├── api/
│   └── api-client.ts          # Browser-side API client
├── hooks/
│   └── use-split-diff-resizer.ts
└── styles/                    # CSS
```

## Conventions

- **`-shared/`** directories (dash prefix) are TanStack Router convention — not rendered as routes, shared across sibling routes.
- **`-lib/`** in api routes — private route helpers, not exposed as endpoints.
- API wiring files (`*-api-live.ts`) use `HttpApiBuilder.group(DomainApi, "groupName", ...)`.
- `api/$.ts` is the catch-all that composes all wiring layers + `CoreLive` + SSE events.
- Browser runtime: `client-runtime.ts` creates an Effect runtime for client-side use.
- Shiki for syntax highlighting (custom themes in `lib/shiki-theme.ts`, `lib/pierre-diffs-theme.ts`).

## Where to Look

| Task                      | File                                                  |
| ------------------------- | ----------------------------------------------------- |
| Add page route            | `routes/` — new file = new route                      |
| Add API endpoint handler  | `routes/api/-lib/wiring/` — match to domain-api group |
| Add shared diff component | `routes/-shared/diff/`                                |
| Add UI primitive          | `components/ui/`                                      |
| Change theme              | `lib/theme/`                                          |
| Change API client         | `api/api-client.ts`                                   |

## Anti-Patterns

- Do NOT put business logic in route handlers — delegate to `@ringi/core` services.
- Do NOT import from `apps/cli`.
- Do NOT bypass the catch-all `api/$.ts` for API routes — all endpoints go through the Effect HttpApi layer.
