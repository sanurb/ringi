# Review Workflow

The complete workflow for reviewing AI-generated code changes before committing.

## Quick path (copy/paste)

```bash
# Stage what you actually want to review
git add -A

# Start server + open UI
ringi serve

# Snapshot staged diff into a review session
ringi review create

# (Review in browser: comments/suggestions/todos)

# Decide + approve
ringi review resolve last --yes

# Export audit record
ringi export last --output review.md
```

## Pi integration (via /ringi-review command)

If you're running inside Pi, the `/ringi-review` command automates the full cycle:

```
/ringi-review                         # staged changes (default)
/ringi-review --branch main           # branch comparison
/ringi-review --commits a1b,c2d       # specific commits
/ringi-review --pr <github-pr-url>    # GitHub PR
/ringi-review --port 4123             # custom server port
/ringi-review --send                  # auto-send feedback to agent
```

What happens:

1. Pi ensures `ringi serve` is running (auto-starts if needed)
2. Creates a review session via the Ringi HTTP API
3. Opens the Ringi web UI in the system browser
4. Shows a "Waiting for review" widget in the Pi TUI
5. Polls until you approve or request changes in the Ringi UI
6. Fetches the structured feedback (comments + suggestions)
7. Hands off feedback to the agent:
   - **Default:** inserts into the Pi editor — you can edit before pressing Enter
   - **`--send`:** auto-submits as a user message, triggering the next agent turn immediately
8. If changes were requested, injects context so the agent knows it's in post-review mode

This closes the loop: AI writes code → you review in Ringi → feedback flows back to the AI.

## Basic workflow

### 1. AI Makes Changes

After an AI agent modifies your codebase, you'll have unstaged or staged changes in git.

### 2. Start the Review Server

```bash
ringi serve
```

This opens the web interface at http://localhost:3000.

### 3. Create a Review Session

From the CLI:

```bash
# Review staged changes (default)
ringi review create

# Review changes against a branch
ringi review create --source branch --branch main

# Review specific commits
ringi review create --source commits --commits 8d2c4f1,0fbd6a2
```

Or use the "New Review" page in the web UI to select your review source.

### 4. Review in the Web UI

Navigate to the review session. The workspace shows:

- **File tree** — all changed files, grouped when intelligence is available
- **Diff view** — side-by-side or unified diff with syntax highlighting
- **Annotations panel** — comments, suggestions, and todos for the review

### 5. Add Comments and Suggestions

Click on any line in the diff view to add:

- **Comments** — questions, notes, or issue flags
- **Suggestions** — proposed replacement code the reviewer can apply
- **Todos** — follow-up tasks linked to the review session

### 6. Resolve and Approve

When satisfied with the changes:

```bash
# Resolve all comments and approve the review
ringi review resolve last

# Or approve a specific review
ringi review resolve rvw_01JY6Z4Y9B6GJ6T4J9M7AQ8S3R --yes
```

### 7. Export and Commit

```bash
# Export review as markdown
ringi export last --output review.md

# Commit the approved changes
git commit -m "Add feature X"
```

## Review Lifecycle

Reviews follow a formal lifecycle:

```
created → analyzing → ready → in_review → approved → exported
                                       → changes_requested → exported
```

Key rules:

- **Approved reviews reopen** when new comments are added or todos are created
- **Exported is terminal** — no mutations after export
- Reviews are **snapshot-based** — the diff is captured at creation time and does not change when refs move

## Decision points

- If the diff is messy: preview before snapshotting (`ringi source diff staged --stat`), then stage only what you want and create the review.
- If you need “PR-style” review: use branch source (`--source branch --branch main`) to capture the full divergence.
- If you’re reviewing after-the-fact: use commit source (`--source commits --commits <sha>`).

## Example Session

```bash
# AI agent makes changes...

# Stage the changes
git add -A

# Start review
ringi serve

# Create a review session from staged changes
ringi review create

# (Review in browser, add comments, resolve issues)

# Approve the review
ringi review resolve last --yes

# Check todos before committing
ringi todo list

# Export for audit trail
ringi export last --output .ringi/exports/feature-x.md

# Commit
git commit -m "Add feature X"
```
