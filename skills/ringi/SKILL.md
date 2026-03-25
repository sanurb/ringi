---
name: ringi
description: Review AI-generated code changes before committing using Ringi. Use to create review sessions, add comments/suggestions/todos, resolve decisions, export audit records, and (optionally) integrate via MCP.
---

## When to use

Use this skill whenever you are working with Ringi to review AI-generated code changes before committing them. Ringi is local-first and provides a web UI for visual diff review with inline comments, code suggestions, and todo tracking.

Also use this skill when the user mentions:

- `review`, `ringi`, or `before commit`
- creating review sessions
- managing comments/suggestions/todos
- exporting reviews for documentation/audit
- “what should I do next” after an AI agent made changes

## Workflow

### Quick path (typical workflow)

1. Stage the AI changes: `git add -A`
2. Start (or reuse) the web server: `ringi serve`
3. Create a review from staged changes: `ringi review create`
4. Review in the web UI:
   - add inline comments and/or code suggestions
   - create todos for follow-up work instead of blocking the commit
5. Resolve + decide when ready: `ringi review resolve last --yes`
6. Export for audit/documentation: `ringi export last --output review.md`
7. Commit normally with git

### Decision points (so you pick the right command)

- If the server is already running, you can usually stay in the UI. For standalone reads (listing/showing/exporting), you do not need the server.
- Mutations like creating reviews and adding comments/todos require the server; “read-only” commands can run without it.
- Reviews are snapshot-based: once created, the diff is anchored even if your branch moves later.

### Review sources (choose once at creation time)

- Default: staged changes (safest local workflow)
- Branch comparison: `ringi review create --source branch --branch main`
- Commit(s): `ringi review create --source commits --commits <sha,...>`

For details, see `rules/staging.md`.

### Rule files (detailed behavior)

Read the individual rule files below when you need specifics or examples:

- [rules/installation.md](rules/installation.md) - Installing/running and mode behavior (standalone vs server vs MCP)
- [rules/review-workflow.md](rules/review-workflow.md) - Full end-to-end review flow and lifecycle rules
- [rules/staging.md](rules/staging.md) - Staging files and choosing review sources
- [rules/cli-commands.md](rules/cli-commands.md) - CLI reference for all commands
- [rules/todos.md](rules/todos.md) - Todos and how they impact the review lifecycle
- [rules/comments.md](rules/comments.md) - Inline comments and code suggestions
- [rules/export.md](rules/export.md) - Export rules, filtering, and automation
- [rules/tips.md](rules/tips.md) - Productivity tips and keyboard shortcuts

## Output expectations (when acting as the agent)

- Prefer copy/pasteable command blocks over prose.
- When suggesting a workflow, always include the “safe default” staged source (`git add -A` → `ringi review create`) unless the user explicitly wants branch/commit sources.
- If the user asks “can I commit?”, ensure there’s either (a) an approved review decision, or (b) a clear reason why they’re skipping review.
