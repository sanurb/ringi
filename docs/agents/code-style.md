# Code Style Conventions

## Language and Runtime

- **Effect v4** everywhere: `Effect.gen`, `Schema.TaggedError`, `Schema.Class`, branded IDs, Layer composition.
- **SQLite** via `node:sqlite` (Node built-in), WAL mode, `DatabaseSync`.
- CLI outputs RFC 9457-inspired JSON envelopes with HATEOAS `nextActions`.

## Import Patterns

- Cross-package: `import { X } from "@ringi/core/services/review.service"`
- Within app: `import { Y } from "@/components/..."` (alias → own `src/`)

## Dependency Rules

1. `packages/core` has **zero** workspace dependencies.
2. Both apps depend on `@ringi/core` via `workspace:*`.
3. Apps **never** depend on each other.

## Anti-Patterns

- Do NOT create granular packages (`packages/git`, `packages/db`) — extract to core only when ≥2 consumers exist.
- Do NOT add full-repo indexing or persistent knowledge graphs — intelligence is review-scoped.
- Do NOT auto-apply code changes from suggestions.
- Do NOT treat HTML as trusted in evidence/provenance rendering.

## Priorities

1. Performance first.
2. Reliability first.
3. Correctness and robustness over short-term convenience.

## Effect Reference

`~/.local/share/ai-references/effect/v4/LLMS.md` is the authoritative source for Effect v4 patterns.
Read it before browsing `node_modules/`.
