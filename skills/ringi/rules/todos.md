# Todos

Track follow-up tasks during code review.

## Quick start

```bash
# Add a follow-up task (link it to the current review)
ringi todo add --text "Write tests for the new endpoint" --review last

# See what's still pending before committing
ringi todo list
```

## Creating Todos

### From the Web UI

In the annotations panel, use the todo form to create tasks linked to the current review. This keeps operational work attached to the review session.

### From the CLI

```bash
ringi todo add --text "Write tests for the new endpoint"
ringi todo add --text "Update docs for API changes" --review last
```

## Listing Todos

```bash
# Show pending todos
ringi todo list

# Show todos for a specific review
ringi todo list --review last

# Show all todos including completed
ringi todo list --status all

# JSON output for scripting
ringi todo list --json
```

## Completing Todos

```bash
# Mark todo as done
ringi todo done todo_01JY702YJ0D3P1KAPM9J8Q6W4E

# Reopen a completed todo
ringi todo undone todo_01JY702YJ0D3P1KAPM9J8Q6W4E
```

## Reordering and Removing

```bash
# Move todo to position 1 (top)
ringi todo move todo_01JY702YJ0D3P1KAPM9J8Q6W4E --position 1

# Remove a single todo
ringi todo remove todo_01JY702YJ0D3P1KAPM9J8Q6W4E --yes

# Clear completed todos
ringi todo clear --done-only --yes

# Clear ALL todos (destructive)
ringi todo clear --all --yes
```

## Lifecycle Impact

Todos interact with the review lifecycle:

- **Creating a todo** on an `approved` review **reopens** it
- **Reopening a todo** on an `approved` review **reopens** it
- **Completing a todo** does NOT auto-approve the review
- **After export**, no todos can be created or modified

## Decision points

- Use a todo when the issue is real but **not worth blocking** approval right now.
- If a todo is blocking approval, keep the review open and resolve it before `ringi review resolve`.
- If you add a todo after approval, expect the review to reopen (intentional).

## Workflow Integration

```bash
# After AI makes changes
ringi serve

# Create review and inspect
ringi review create

# (Review in browser, create todos for follow-up work)

# Check what's pending before committing
ringi todo list

# If todos are blocking, address them first
# If not, commit and handle todos in follow-up commits
ringi review resolve last --yes
git commit -m "Add feature X"

# Work through remaining todos
ringi todo done todo_01JY702YJ0D3P1KAPM9J8Q6W4E
# ... make changes ...
git commit -m "Add tests for feature X"
```

## Best Practices

1. **Create todos during review** — Spot something non-blocking? Create a todo instead of blocking the commit
2. **Check todos before committing** — Run `ringi todo list` before each commit
3. **Keep todos actionable** — Write clear, specific tasks ("Add error handling for timeout in auth.ts" not "fix auth")
4. **Link todos to reviews** — Use `--review last` to keep context attached
5. **Use ordering** — Put highest-priority todos at position 1
