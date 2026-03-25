# Comments and Suggestions

Add inline comments and code suggestions to reviews.

## Adding Comments

### In the Web UI

Click on any line in the diff view to open the inline comment composer. Comments are anchored to specific lines and display in context.

### Comment Workflow

1. Click a line in the diff
2. Write your comment
3. Optionally add a code suggestion (replacement code)
4. Submit — the comment appears inline in the diff and in the annotations panel

## Code Suggestions

Suggestions propose specific code replacements:

1. Click on the line you want to change
2. Toggle "Add suggestion" in the comment form
3. Write the suggested replacement code in the editor
4. Submit — the reviewer can apply the suggestion directly in the UI

Suggestions are stored as part of the comment, not as separate entities.

## Comment Types

Use comments strategically:

- **Question** — Ask for clarification about AI-generated logic
- **Note** — Leave context for future reference
- **Suggestion** — Propose a concrete code change
- **Issue** — Flag a problem that needs attention before commit

## Resolving Comments

Comments can be resolved in two ways:

1. **Individually** — Click the resolve button on each comment in the UI
2. **Bulk resolve + approve** — Run `ringi review resolve last` to resolve all comments and approve

### Lifecycle Impact

Comments interact with the review lifecycle:

- **Creating a comment** on an approved review **reopens** it automatically
- **Unresolving a comment** on an approved review **reopens** it automatically
- **Resolving all comments** is required before approval can succeed
- **After export**, no comments can be created or modified

## Best Practices

1. **Be specific** — Reference exact variable names, functions, or patterns
2. **Explain why** — Don't just say "change this"; explain the reasoning
3. **Use suggestions for simple fixes** — If you know the exact replacement, suggest it
4. **Create todos for complex issues** — If a comment requires significant work, add a linked todo
5. **One issue per comment** — Makes tracking and resolution cleaner

## Draft Recovery

If a browser session restarts, Ringi recovers unsaved comment drafts. The draft recovery modal appears when you return to a review with uncommitted draft text.
