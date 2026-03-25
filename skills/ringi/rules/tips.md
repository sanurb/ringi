# Tips and Best Practices

Productivity tips for getting the most out of Ringi.

## Quick Commands

```bash
# Start review quickly
ringi serve

# Create review from staged changes
ringi review create

# Approve and export in one flow
ringi review resolve last --yes
ringi export last --output review.md

# Check pending todos before committing
ringi todo list
```

## Decision points

- If you’re not sure what’s staged: preview first with `ringi source diff staged --stat`.
- If you’re about to push a branch: create a branch-based review (`--source branch --branch main`).
- If the review is large: split the work into multiple small reviews/commits for higher signal.

## Keyboard Shortcuts

In the web interface:

- `j` / `k` — Navigate between files
- `n` / `p` — Navigate between changes/hunks
- `c` — Add comment on selected line
- `?` — Show all shortcuts

## Workflow Tips

### 1. Review Before Staging

Preview what you'll review before creating a session:

```bash
ringi source diff staged --stat
# Looks good? Stage and create
ringi review create
```

### 2. Keep Reviews Small

Review and commit frequently rather than accumulating large changesets. Small reviews are faster to inspect and produce better audit trails.

### 3. Create Todos for Non-Blocking Issues

Don't block your commit for minor issues. Create a todo and address it in a follow-up:

```bash
ringi todo add --text "Improve error messages in auth module" --review last
ringi review resolve last --yes
git commit -m "Add auth feature"
# Handle the todo later
```

### 4. Export Important Reviews

For significant changes, export the review for documentation:

```bash
ringi export last --output docs/reviews/feature-x.md
```

### 5. Check Todos Before Each Commit

Make it a habit:

```bash
ringi todo list && git commit -m "message"
```

### 6. Use Branch Source for PR Prep

Before pushing a branch, review against the target:

```bash
ringi review create --source branch --branch main
# Review the full PR diff locally before pushing
```

### 7. Use JSON for Scripting

Ringi's JSON output includes `next_actions` — suggested follow-up commands:

```bash
ringi review list --json | jq '.result.reviews[0].id'
ringi review show last --json | jq '.next_actions'
```

## Integration with AI Workflows

When working with AI agents:

1. Let the AI make changes
2. Stage changes: `git add -A`
3. Create review: `ringi review create`
4. Run `ringi serve` to review in browser
5. Add comments for anything the AI should fix
6. Create todos for follow-up work
7. Approve and commit when satisfied

This creates a feedback loop where you catch AI mistakes before they're committed.

## Agent Integration via MCP

AI agents can inspect and create reviews programmatically:

```bash
# Start MCP server for agent use (read-only recommended)
ringi mcp --readonly
```

Agents use the `execute` tool to run JavaScript against review-scoped namespaces (`reviews`, `todos`, `sources`, `session`). See `docs/MCP.md` for the full agent guide.

## Performance Tips

- **Keep reviews small** — large diffs slow down review and export
- **Use `--no-open`** when you already have the browser open
- **Use standalone mode** for reads — `ringi review list` and `ringi export` don't need a running server
- **Use `--stat`** to preview diff size before creating a full review session
