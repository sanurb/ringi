# Exporting Reviews

Export review sessions as markdown for documentation, sharing, or audit trails.

## Quick start

```bash
# Approve first (export requires a decision)
ringi review resolve last --yes

# Export to a file
ringi export last --output review.md
```

## Basic Export

```bash
# Export the most recent review to stdout
ringi export last

# Export a specific review by ID
ringi export rvw_01JY6Z4Y9B6GJ6T4J9M7AQ8S3R
```

## Save to File

```bash
# Save to a specific file
ringi export last --output review.md

# Save with a descriptive name
ringi export last --output .ringi/exports/feature-auth-review.md
```

## Export Content

The exported markdown includes:

- Review metadata (date, lifecycle state, review source)
- Review decision (approved or changes requested)
- List of all changed files with diff summary
- Inline comments and their resolution status
- Code suggestions and whether they were applied
- Linked todos and their completion status

## Export Lifecycle Rules

Exports interact with the review lifecycle:

- **Export requires a decision** — the review must be `approved` or `changes_requested` before exporting. Reviews still `in_review` cannot be exported.
- **Export is terminal** — the first successful export sets `exported_at` and locks the review. No comments, todos, or lifecycle changes are allowed after export.
- **Export is idempotent** — attempting to export an already-exported review returns the existing export, not an error.
- **Export is snapshot-based** — the export uses stored review data, never live git state. The same review always produces the same export.

## Decision points

- Export is the “write-once audit record”: after export, the review is locked.
- If you need a shorter artifact: use filtering flags (`--no-resolved`, `--no-snippets`).
- Prefer saving exports under a deterministic path (e.g. `.ringi/exports/<topic>.md` or `docs/reviews/<topic>.md`).

## Export Filtering

```bash
# Omit resolved comments
ringi export last --no-resolved

# Omit code suggestion blocks
ringi export last --no-snippets

# Both
ringi export last --no-resolved --no-snippets
```

## JSON Export

```bash
ringi export last --json
```

Returns the standard CLI JSON envelope with the markdown content and export metadata.

## Use Cases

1. **Audit trail** — Keep a record of what was reviewed, what comments were made, and what the decision was
2. **Team sharing** — Share reviews with team members who don't use Ringi
3. **CI integration** — Export in scripts as part of a review-and-commit automation pipeline
4. **Learning** — Review past feedback to improve code quality over time
5. **Compliance** — Maintain proof that AI-generated code was reviewed before commit

## Example Automation

```bash
# Full review-export-commit pipeline
ringi review create
# (Review in browser)
ringi review resolve last --yes
ringi export last --output "reviews/$(date +%Y-%m-%d)-feature.md"
git add -A
git commit -m "Add feature with reviewed AI changes"
```
