# Staging and Review Sources

Ringi supports three review sources. Each captures a snapshot at creation time.

## Review Sources

### Staged Changes (Default)

Reviews the current staged index against HEAD.

```bash
# Stage files first
git add src/feature.ts tests/feature.test.ts

# Create review from staged changes
ringi review create
```

This is the safest local workflow — you explicitly choose what to review.

### Branch Comparison

Reviews the divergence between a named branch and your current HEAD.

```bash
ringi review create --source branch --branch main
```

### Commit Range

Reviews specific commits.

```bash
# Multiple commits
ringi review create --source commits --commits 8d2c4f1,0fbd6a2

# Commit range
ringi review create --source commits --commits abc123..def456
```

## Previewing Before Review

Use `ringi source` commands to inspect what you'll review before creating a session:

```bash
# List available sources
ringi source list

# Preview a diff without creating a review
ringi source diff staged
ringi source diff branch --branch main --stat
ringi source diff commits --commits 8d2c4f1,0fbd6a2
```

## Snapshot Anchoring

Once a review session is created, the diff is **captured and stored**. The review remains stable even if:

- The branch moves forward
- Commits are rebased or amended
- Staged changes are modified

This is intentional — exports and review annotations must be reproducible from stored data.

## Staging in the Web UI

On the "New Review" page in the web UI, you can:

- Select the review source type (staged, branch, commits)
- See a preview of changed files
- Create the review session directly

## Best Practices

1. **Review before staging** — Use `ringi source diff staged --stat` to preview
2. **Stage related changes together** — Keep reviews focused and atomic
3. **Don't stage generated files** — Avoid staging files in `.gitignore`
4. **Use branch source for PRs** — Compare against the target branch before pushing
5. **Use commit source for post-hoc review** — Review commits already made
