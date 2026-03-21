# CLI Reference

## Overview

`ringi` is the command-line surface for the same review workflow the local web app exposes. It is not a thin dev helper and it is not a fallback for when the UI is unavailable. It is a first-class interface for creating a review session, inspecting review state, exporting outcomes, managing todos, streaming events, and starting local runtimes.

The CLI exists for three reasons:

- review work often starts in the shell, before a browser is open
- local-first products need automation surfaces that do not depend on a hosted control plane
- agents and shell scripts need stable contracts around review, todo, export, and event workflows

The CLI operates in three product modes:

- **standalone** — direct local access to `.ringi/reviews.db` for read-only operations
- **server-connected** — commands that use a running local server for mutations or live streams
- **MCP stdio** — `ringi mcp` for agent integration over stdio

## Philosophy

### Predictable defaults

A command should do the most likely correct thing when called with the minimum useful input. `ringi review create` defaults to the staged diff because staged changes are the safest explicit review source in a local workflow. `ringi export last` resolves to the most recent review session because export is commonly the last step in an automated review loop.

Predictable defaults reduce friction without hiding behavior. Defaults are always documented, visible in `--help`, and reproducible in `--json` output.

### Scriptability

The CLI must compose with pipes, `xargs`, shell scripts, CI jobs, and agent runtimes. That means:

- machine-readable output is opt-in with `--json`
- stdout is reserved for data
- stderr is reserved for diagnostics and errors
- exit codes are stable and meaningful
- commands never require interactive prompts unless the operation is destructive

### Stable output contracts

Automation breaks when output shape drifts. Human-readable output may evolve for clarity, but JSON output is versioned by convention and follows one envelope across command families.

A caller should be able to treat `ringi` as a durable local API, not as prettified terminal text.

### Terse happy paths

The default experience should be fast to scan and quiet enough to stay out of the way. A successful command prints the minimum context needed to confirm what happened. Long explanations belong in `--help`, `--verbose`, or structured JSON.

### Helpful errors

Errors must say what failed, why it failed, and what the next action is. "No staged changes" is useful. "Review not found: rvw_123" is useful. "Database error" without context is garbage.

Helpful errors matter more in a local-first tool because the user usually has everything needed to recover immediately.

### Minimal surprise

Commands should not silently switch transport modes, mutate unrelated state, or emit incidental noise. Read-only commands never require a running server. Mutations that need server coordination say so. Destructive commands require explicit confirmation or an explicit bypass flag.

If a maintainer cannot predict whether a command reads from SQLite, calls the local server, or starts a runtime, the interface is lying.

## Command Naming Principles

Ringi uses **noun-first command families**:

- `review create`
- `review list`
- `todo add`
- `source diff`
- `data migrate`

This keeps related actions discoverable and avoids the flat-command sprawl that turns CLIs into trivia games.

Naming rules:

1. **One domain, one family.** Review lifecycle commands live under `review`. Todo operations live under `todo`. Storage operations live under `data`.
2. **Verb names are plain English.** Use `create`, `list`, `show`, `export`, `resolve`, `move`, `reset`. Do not invent synonyms for style.
3. **Prefer full words over abbreviations.** `review` instead of `rvw`, `source` instead of `src`, `doctor` instead of `diag`.
4. **Aliases are rare and deliberate.** The CLI keeps `ringi export` as a top-level alias for `ringi review export` because export is frequently piped to stdout in automation. The nested form remains canonical.
5. **No overloaded verbs.** A verb means one thing in one family. `show` reads. `create` creates. `reset` destroys local data. No hidden dual behavior.

## Input/Output Conventions

Default output is human-readable and optimized for terminal scanning. Machine consumers opt into JSON with `--json`.

### Standard behavior

- **stdout**: command data, tables, summaries, exported markdown
- **stderr**: warnings, validation errors, stack traces, transport diagnostics
- **exit code `0`**: command completed, including empty read results
- **non-zero exit code**: command failed, was used incorrectly, or could not satisfy its contract

### Common flags

- `--json` returns the standard JSON envelope
- `--quiet` suppresses human-readable success output; errors still go to stderr
- `--verbose` adds diagnostic detail and stack traces on failure
- `--no-color` disables ANSI color in human-readable output

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `2` | Usage error or invalid flag combination |
| `3` | Requested resource not found |
| `4` | Repository or `.ringi/` state not initialized for the requested operation |
| `5` | Authentication or authorization failure |
| `1` | All other runtime, validation, transport, or storage failures |

## Repository Discovery

By default, `ringi` starts from the current working directory and walks upward until it finds the Git repository root. From there it resolves the local state directory as:

```text
<repo-root>/.ringi/
<repo-root>/.ringi/reviews.db
```

Resolution rules:

1. Start from the current working directory.
2. Find the enclosing Git repository root.
3. Resolve `.ringi/` relative to that root.
4. If `--repo <path>` is provided, use that path as the repository root instead of the current directory.

If `.ringi/` or `.ringi/reviews.db` is missing, commands fail gracefully with a helpful message. Read-only commands should tell the user whether the repository has never been initialized, migrations are pending, or the path is invalid.

Examples of expected errors:

- `No .ringi directory found under /path/to/repo. Run 'ringi data migrate' or start 'ringi serve' once to initialize local state.`
- `Path /tmp/foo is not a Git repository. Use --repo <path> with a valid repository root.`

## Operational Modes

| Mode | Transport | Typical commands | Notes |
| --- | --- | --- | --- |
| **standalone** | Direct SQLite read from `.ringi/reviews.db` | `review list`, `review show`, `review export`, `review status`, `todo list`, `source list`, `source diff`, `export`, `doctor` | No server required. Read-only only. |
| **server-connected** | Local HTTP/SSE through the running Ringi server | `serve`, `review create`, `review resolve`, `todo create`, `todo complete`, `todo uncomplete`, `todo move`, `todo delete`, `todo clear`, `events`, `data migrate`, `data reset` | Used for mutations, runtime startup, and live event streaming. |
| **MCP stdio** | stdio transport via `ringi mcp` | `mcp` | Exposes the same domain through agent-facing namespaces. |

Command availability summary:

| Command family | Standalone | Server-connected |
| --- | --- | --- |
| `review list` / `review show` / `review export` / `review status` | Yes | Yes |
| `review create` / `review resolve` | No | Yes |
| `todo list` | Yes | Yes |
| `todo create` / `todo complete` / `todo uncomplete` / `todo move` / `todo delete` / `todo clear` | No | Yes |
| `source list` / `source diff` | Yes | Yes |
| `export` | Yes | Yes |
| `events` | No | Yes |
| `serve` / `mcp` | N/A | Starts runtime |
| `doctor` | Yes | Yes |
| `data migrate` / `data reset` | No | Yes |

## Global Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `--json` | boolean | `false` | Emit the standard JSON envelope to stdout. |
| `--quiet` | boolean | `false` | Suppress non-error human-readable output. Ignored by commands whose primary output is streamed data. |
| `--repo <path>` | string | current repo root | Use a specific repository root instead of discovering from the current working directory. |
| `--verbose` | boolean | `false` | Include diagnostics such as transport details, timing, and stack traces on failure. |
| `--no-color` | boolean | `false` | Disable ANSI color in human-readable output. |

## Command Reference

### Naming decision

The roadmap used a few flat commands such as `ringi list`, `ringi status`, and `ringi resolve`. The CLI standardizes review lifecycle operations under the `review` family so the command tree stays coherent as the product grows. The only retained top-level shortcut is `ringi export`, because export is commonly used in shell pipelines and maps naturally to stdout.

### `ringi serve`

```bash
ringi serve [--host <host>] [--port <port>] [--https] [--cert <path>] [--key <path>] [--auth] [--username <name>] [--password <value>] [--no-open]
```

Starts the local Ringi server and web UI. This is the entrypoint for server-connected mutations, SSE delivery, and browser-based review work.

**Arguments**

None.

**Options**

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `--host <host>` | string | `127.0.0.1` | Bind host. |
| `--port <port>` | number | `3000` | Bind port. |
| `--https` | boolean | `false` | Serve over HTTPS. Requires `--cert` and `--key`. |
| `--cert <path>` | string | none | TLS certificate path when `--https` is enabled. |
| `--key <path>` | string | none | TLS private key path when `--https` is enabled. |
| `--auth` | boolean | `false` | Require HTTP basic authentication for the web UI and mutating HTTP endpoints. |
| `--username <name>` | string | none | Username for `--auth`. Required when auth is enabled. |
| `--password <value>` | string | none | Password for `--auth`. Required when auth is enabled. |
| `--no-open` | boolean | `false` | Do not open a browser automatically. |

**Behavior**

- Starts the local web runtime.
- Initializes local state if needed.
- Enables server-connected commands such as `review create`, `review resolve`, `todo *`, `events`, `data migrate`, and `data reset`.
- Fails with exit code `1` on bind errors or invalid runtime configuration.
- Fails with exit code `5` on invalid auth configuration when `--auth` is requested without credentials.

**Examples**

```bash
ringi serve
ringi serve --port 4123 --no-open
ringi serve --https --cert ./certs/dev.crt --key ./certs/dev.key --auth --username reviewer --password local-dev
```

**Exit codes**

- `0` server started successfully
- `1` bind failure, TLS configuration error, or startup failure
- `5` invalid auth configuration

### `ringi review create`

```bash
ringi review create [--source <staged|branch|commits>] [--branch <name>] [--commits <sha[,sha...]|range>] [--title <title>]
```

Creates a review session from a review source. With no arguments it defaults to the staged diff, which is the safest explicit local review source.

**Arguments**

None.

**Options**

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `--source <type>` | enum | `staged` | Review source: `staged`, `branch`, or `commits`. |
| `--branch <name>` | string | none | Branch name when `--source branch` is used. |
| `--commits <value>` | string | none | Commit SHAs or commit range when `--source commits` is used. Stored as the review source reference. |
| `--title <title>` | string | none | Optional display label for human output and future exports. |

**Behavior**

- Requires server-connected mode.
- For `staged`, reads the staged diff and fails if there are no staged changes.
- For `branch`, compares `<branch>...HEAD`.
- For `commits`, creates a review session from the specified commit set.
- Returns the new review id, review source, file count, and diff summary.

**Examples**

```bash
ringi review create
ringi review create --source branch --branch main
ringi review create --source commits --commits 8d2c4f1,0fbd6a2
```

**Exit codes**

- `0` review session created
- `2` invalid flag combination or missing source-specific option
- `1` no staged changes, no commits, repo mismatch, or write failure
- `4` `.ringi/` state unavailable

### `ringi review list`

```bash
ringi review list [--status <status>] [--source <staged|branch|commits>] [--limit <n>] [--page <n>]
```

Lists review sessions for the current repository. Empty results are valid and return exit code `0`.

**Arguments**

None.

**Options**

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `--status <status>` | enum | all | Filter by review status: `in_progress`, `approved`, `changes_requested`. |
| `--source <type>` | enum | all | Filter by review source. |
| `--limit <n>` | number | `20` | Maximum reviews per page. |
| `--page <n>` | number | `1` | Page number, starting at 1. |

**Behavior**

- Works in standalone and server-connected modes.
- Reads review metadata, repository info from the review snapshot, and file counts.
- Human output renders a compact table. `--json` returns pagination metadata and the review array.

**Examples**

```bash
ringi review list
ringi review list --status in_progress --source branch
ringi review list --limit 50 --json
```

**Exit codes**

- `0` command executed, even if no reviews matched
- `2` invalid filter value
- `4` `.ringi/` state unavailable
- `1` read failure

### `ringi review show <id>`

```bash
ringi review show <id|last> [--comments] [--todos]
```

Shows full detail for a review session, including summary data for changed files. `last` resolves to the most recent review session in the current repository.

**Arguments**

| Argument | Description |
| --- | --- |
| `<id|last>` | Review id or the special selector `last`. |

**Options**

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `--comments` | boolean | `false` | Include comment summaries in human-readable output. |
| `--todos` | boolean | `false` | Include linked todos in human-readable output. |

**Behavior**

- Works in standalone and server-connected modes.
- Returns review status, review source, repository snapshot details, changed files, and diff summary.
- When `last` is used, the most recent review session by creation time is selected.

**Examples**

```bash
ringi review show rvw_01JY6Z4Y9B6GJ6T4J9M7AQ8S3R
ringi review show last --comments
ringi review show last --json
```

**Exit codes**

- `0` review found and displayed
- `3` review session not found
- `4` `.ringi/` state unavailable
- `1` read failure

### `ringi review export <id>`

```bash
ringi review export <id|last> [--output <path>] [--stdout] [--no-resolved] [--no-snippets]
```

Exports a review session as markdown. The export contains review metadata, changed files, comments, and todos. `last` exports the most recent review session.

**Arguments**

| Argument | Description |
| --- | --- |
| `<id|last>` | Review id or `last`. |

**Options**

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `--output <path>` | string | none | Write markdown to a file path. |
| `--stdout` | boolean | `false` | Force export content to stdout even when `--output` is provided. |
| `--no-resolved` | boolean | `false` | Omit resolved comments from the rendered markdown. |
| `--no-snippets` | boolean | `false` | Omit code suggestion blocks from the rendered markdown. |

**Behavior**

- Works in standalone and server-connected modes.
- Uses the review session as the anchor for export, not the current working tree.
- If neither `--output` nor `--stdout` is provided, human-readable mode prints the markdown to stdout.
- `ringi export <id|last>` is a top-level alias to this command.

**Examples**

```bash
ringi review export last
ringi review export rvw_01JY6Z4Y9B6GJ6T4J9M7AQ8S3R --output review.md
ringi review export last --no-resolved --no-snippets --json
```

**Exit codes**

- `0` export generated
- `3` review session not found
- `4` `.ringi/` state unavailable
- `1` export or write failure

### `ringi review resolve <id>`

```bash
ringi review resolve <id|last> [--all-comments] [--yes]
```

Bulk-resolves remaining comments for a review session and marks the review status as approved. This is intentionally explicit because it is a mutation with workflow meaning.

**Arguments**

| Argument | Description |
| --- | --- |
| `<id|last>` | Review id or `last`. |

**Options**

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `--all-comments` | boolean | `true` | Resolve all unresolved comments before approval. |
| `--yes` | boolean | `false` | Skip confirmation prompt in non-interactive environments. |

**Behavior**

- Requires server-connected mode.
- Resolves remaining comments and updates the review status to `approved`.
- Prints a confirmation-safe summary showing the number of comments resolved and the final review status.

**Examples**

```bash
ringi review resolve last
ringi review resolve rvw_01JY6Z4Y9B6GJ6T4J9M7AQ8S3R --yes
ringi review resolve last --json
```

**Exit codes**

- `0` review session resolved and approved
- `3` review session not found
- `2` invalid usage or confirmation declined in strict non-interactive mode
- `1` mutation failure
- `4` `.ringi/` state unavailable

### `ringi review status`

```bash
ringi review status [--review <id|last>] [--source <staged|branch|commits>]
```

Shows the current repository and review state: active branch, staged or source status, latest review session, unresolved comment counts, and stale-state hints.

**Arguments**

None.

**Options**

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `--review <id|last>` | string | latest relevant review | Focus status on a specific review session. |
| `--source <type>` | enum | inferred | Show source-specific status for staged, branch, or commits. |

**Behavior**

- Works in standalone and server-connected modes.
- Intended as the shell-native "where am I?" command for the current repository.
- If no review session exists, returns exit code `0` with a helpful empty-state summary.

**Examples**

```bash
ringi review status
ringi review status --review last
ringi review status --source staged --json
```

**Exit codes**

- `0` status retrieved, including empty state
- `2` invalid source value
- `4` `.ringi/` state unavailable
- `1` read failure

### `ringi todo add`

```bash
ringi todo add --text <text> [--review <id>] [--position <n>]
```

Creates a todo item, optionally linked to a review session. Review-linked todos keep operational work attached to the review session instead of drifting into separate notes.

**Arguments**

None.

**Options**

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `--text <text>` | string | none | Todo text. Required. |
| `--review <id>` | string | none | Link the todo to a review session. |
| `--position <n>` | number | append | Insert at a specific position. |

**Behavior**

- Requires server-connected mode.
- Creates the todo and returns the created item with id, content, completion state, and position.
- If `--position` is omitted, the item is appended.

**Examples**

```bash
ringi todo add --text "verify confidence scores on grouped file tree"
ringi todo add --text "re-check provenance on auth adapter" --review rvw_01JY6Z4Y9B6GJ6T4J9M7AQ8S3R
ringi todo add --text "triage remaining comments" --position 1 --json
```

**Exit codes**

- `0` todo created
- `2` missing `--text` or invalid position
- `3` linked review session not found
- `1` mutation failure
- `4` `.ringi/` state unavailable

### `ringi todo list`

```bash
ringi todo list [--review <id>] [--status <pending|done|all>] [--limit <n>] [--offset <n>]
```

Lists todo items globally or for a specific review session.

**Arguments**

None.

**Options**

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `--review <id>` | string | none | Filter to a review session. |
| `--status <pending|done|all>` | enum | `pending` | Filter by completion status. |
| `--limit <n>` | number | no limit | Maximum number of items to return. |
| `--offset <n>` | number | `0` | Offset for pagination. |

**Behavior**

- Works in standalone and server-connected modes.
- Human output prints ordered todos. `--json` returns `{ data, total, limit, offset }` inside the standard envelope.
- Empty results return exit code `0`.

**Examples**

```bash
ringi todo list
ringi todo list --review rvw_01JY6Z4Y9B6GJ6T4J9M7AQ8S3R --status all
ringi todo list --status done --json
```

**Exit codes**

- `0` command executed, including empty result
- `2` invalid filter value
- `1` mutation transport or read failure
- `4` `.ringi/` state unavailable

### `ringi todo done <id>`

```bash
ringi todo done <id>
```

Marks a todo item as done.

**Arguments**

| Argument | Description |
| --- | --- |
| `<id>` | Todo id. |

**Options**

None beyond global options.

**Behavior**

- Requires server-connected mode.
- Updates the todo completion state to done.

**Examples**

```bash
ringi todo done todo_01JY702YJ0D3P1KAPM9J8Q6W4E
ringi todo done todo_01JY702YJ0D3P1KAPM9J8Q6W4E --json
```

**Exit codes**

- `0` todo updated
- `3` todo not found
- `1` mutation failure
- `4` `.ringi/` state unavailable

### `ringi todo undone <id>`

```bash
ringi todo undone <id>
```

Reopens a previously completed todo item.

**Arguments**

| Argument | Description |
| --- | --- |
| `<id>` | Todo id. |

**Options**

None beyond global options.

**Behavior**

- Requires server-connected mode.
- Updates the todo completion state to pending.

**Examples**

```bash
ringi todo undone todo_01JY702YJ0D3P1KAPM9J8Q6W4E
ringi todo undone todo_01JY702YJ0D3P1KAPM9J8Q6W4E --json
```

**Exit codes**

- `0` todo updated
- `3` todo not found
- `1` mutation failure
- `4` `.ringi/` state unavailable

### `ringi todo move <id>`

```bash
ringi todo move <id> --position <n>
```

Moves a todo item to a specific position in the ordered todo list.

**Arguments**

| Argument | Description |
| --- | --- |
| `<id>` | Todo id. |

**Options**

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `--position <n>` | number | none | Target one-based position. Required. |

**Behavior**

- Requires server-connected mode.
- Reorders the todo list and returns the updated item.

**Examples**

```bash
ringi todo move todo_01JY702YJ0D3P1KAPM9J8Q6W4E --position 1
ringi todo move todo_01JY702YJ0D3P1KAPM9J8Q6W4E --position 5 --json
```

**Exit codes**

- `0` todo moved
- `2` missing or invalid `--position`
- `3` todo not found
- `1` mutation failure
- `4` `.ringi/` state unavailable

### `ringi todo remove <id>`

```bash
ringi todo remove <id> [--yes]
```

Deletes a todo item.

**Arguments**

| Argument | Description |
| --- | --- |
| `<id>` | Todo id. |

**Options**

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `--yes` | boolean | `false` | Skip confirmation prompt. |

**Behavior**

- Requires server-connected mode.
- Removes the todo item permanently.

**Examples**

```bash
ringi todo remove todo_01JY702YJ0D3P1KAPM9J8Q6W4E
ringi todo remove todo_01JY702YJ0D3P1KAPM9J8Q6W4E --yes --json
```

**Exit codes**

- `0` todo removed
- `3` todo not found
- `2` confirmation declined in strict non-interactive mode
- `1` mutation failure
- `4` `.ringi/` state unavailable

### `ringi todo clear`

```bash
ringi todo clear [--review <id>] [--done-only] [--all] [--yes]
```

Bulk-clears a filtered set of todo items. This command is destructive by design and therefore explicit.

**Arguments**

None.

**Options**

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `--review <id>` | string | none | Limit the clear operation to a specific review session. |
| `--done-only` | boolean | `true` | Clear only completed todos. |
| `--all` | boolean | `false` | Clear all matched todos, including pending ones. |
| `--yes` | boolean | `false` | Skip confirmation prompt. |

**Behavior**

- Requires server-connected mode.
- Without `--all`, clears only completed todos in the selected scope.
- Returns the number of deleted items.

**Examples**

```bash
ringi todo clear
ringi todo clear --review rvw_01JY6Z4Y9B6GJ6T4J9M7AQ8S3R --yes
ringi todo clear --all --yes --json
```

**Exit codes**

- `0` matching todos cleared
- `2` invalid flag combination or confirmation declined
- `1` mutation failure
- `4` `.ringi/` state unavailable

### `ringi todo`

```bash
ringi todo
```

Shows help for the todo command family. This is a help path, not an error path.

**Behavior**

- Prints subcommand usage and examples.
- Returns exit code `0`.

**Exit codes**

- `0` help shown

### `ringi source list`

```bash
ringi source list [--json]
```

Lists available review sources in the current repository. This is the discovery command for deciding which review source to create a review session from.

**Arguments**

None.

**Options**

None beyond global options.

**Behavior**

- Works in standalone and server-connected modes.
- Returns staged availability, current branch, available branches, and recent commits suitable for commit-based review sessions.

**Examples**

```bash
ringi source list
ringi source list --json
```

**Exit codes**

- `0` sources listed
- `4` repository or `.ringi/` state unavailable
- `1` git inspection failure

### `ringi source diff <source>`

```bash
ringi source diff <source> [--branch <name>] [--commits <sha[,sha...]|range>] [--stat]
```

Previews the diff for a review source without creating a review session.

**Arguments**

| Argument | Description |
| --- | --- |
| `<source>` | One of `staged`, `branch`, or `commits`. |

**Options**

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `--branch <name>` | string | none | Branch name when `<source>` is `branch`. |
| `--commits <value>` | string | none | Commit SHAs or range when `<source>` is `commits`. |
| `--stat` | boolean | `false` | Show summary stats instead of full patch text. |

**Behavior**

- Works in standalone and server-connected modes.
- Reads directly from git and does not create local state.
- Useful before `review create`, especially in scripts that decide whether the diff is worth reviewing.

**Examples**

```bash
ringi source diff staged
ringi source diff branch --branch main --stat
ringi source diff commits --commits 8d2c4f1,0fbd6a2
```

**Exit codes**

- `0` diff or diff summary produced
- `2` missing source-specific option
- `1` git failure or no diff available
- `4` invalid repository path

### `ringi export <id>`

```bash
ringi export <id|last> [--output <path>] [--stdout] [--no-resolved] [--no-snippets]
```

Top-level alias for `ringi review export`. This alias exists because export is frequently the final shell step in a review session workflow.

**Arguments, options, behavior, examples, and exit codes**

Exactly the same as `ringi review export`.

### `ringi events`

```bash
ringi events [--type <reviews|comments|todos|files>] [--since <timestamp>]
```

Tails the server's SSE event stream for live local changes. This is the terminal-native equivalent of the UI staying live while files, todos, comments, or reviews change.

**Arguments**

None.

**Options**

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `--type <value>` | enum | all | Filter to one event type: `reviews`, `comments`, `todos`, or `files`. |
| `--since <timestamp>` | number | now | Resume from a known timestamp if the local event buffer supports it. |

**Behavior**

- Requires server-connected mode.
- Streams newline-delimited event objects to stdout.
- Best used with `--json` and downstream filters.

**Examples**

```bash
ringi events
ringi events --type files
ringi events --json | jq '.data'
```

**Exit codes**

- `0` stream started successfully
- `1` stream connection failed or was interrupted unexpectedly
- `4` server not available

### `ringi mcp`

```bash
ringi mcp [--readonly] [--log-level <silent|error|info|debug>]
```

Starts the MCP stdio server for agent integrations. This is a separate runtime mode, not a sub-mode of `ringi serve`.

**Arguments**

None.

**Options**

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `--readonly` | boolean | `false` | Expose only read-heavy review-session operations. |
| `--log-level <level>` | enum | `error` | Diagnostic verbosity for stderr logs. |

**Behavior**

- Starts a stdio transport for agent clients.
- Reuses the same core service layer as the CLI and web UI.
- Initial namespaces align with the platform domain surface: `reviews`, `todos`, `diff`, `git`, `events`, and `export`.
- In `--readonly` mode, mutation entrypoints are disabled.

**Examples**

```bash
ringi mcp
ringi mcp --readonly
ringi mcp --log-level debug
```

**Exit codes**

- `0` MCP server started successfully
- `1` bootstrap or transport failure
- `4` `.ringi/` state unavailable for requested operations

### `ringi doctor`

```bash
ringi doctor [--json]
```

Runs local diagnostics for repository discovery, `.ringi/` state, SQLite accessibility, migration status, and optional server reachability if a local server is configured.

**Arguments**

None.

**Options**

None beyond global options.

**Behavior**

Checks at least the following:

- current repository root resolution
- `.ringi/` directory presence
- SQLite file presence and readability
- WAL mode compatibility
- pending migration detection
- optional server reachability summary when a local server is configured

**Examples**

```bash
ringi doctor
ringi doctor --json
```

**Exit codes**

- `0` no blocking issues found
- `1` one or more checks failed
- `4` repository discovery failed

### `ringi data migrate`

```bash
ringi data migrate [--json]
```

Runs pending local database migrations for `.ringi/reviews.db`.

**Arguments**

None.

**Options**

None beyond global options.

**Behavior**

- Requires server-connected mode.
- Creates `.ringi/` and the SQLite database when they do not exist.
- Applies pending migrations exactly once.
- Returns the applied migration set and resulting schema version.

**Examples**

```bash
ringi data migrate
ringi data migrate --json
```

**Exit codes**

- `0` migrations applied or no-op because schema is current
- `1` migration failure
- `4` invalid repository root

### `ringi data reset`

```bash
ringi data reset [--yes] [--keep-exports]
```

Resets local Ringi data for the current repository by removing and recreating the SQLite state. This is a destructive recovery command.

**Arguments**

None.

**Options**

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `--yes` | boolean | `false` | Skip destructive confirmation. |
| `--keep-exports` | boolean | `false` | Preserve exported markdown artifacts under `.ringi/exports` if that directory exists. |

**Behavior**

- Requires server-connected mode.
- Deletes local review, comment, todo, provenance, relationship, group, confidence, and export metadata from the current repository state store.
- Recreates the database and applies migrations.

**Examples**

```bash
ringi data reset
ringi data reset --yes
ringi data reset --yes --keep-exports --json
```

**Exit codes**

- `0` local state reset successfully
- `2` confirmation declined
- `1` reset failure
- `4` invalid repository root or missing permissions

## JSON Output Convention

Every JSON-capable command returns the same top-level envelope:

```ts
{
  ok: boolean;
  data: T | null;
  error?: string;
}
```

Rules:

- `ok: true` means the command satisfied its contract.
- `data` contains the command payload. Empty lists are represented as empty arrays, not `null`.
- `data: null` is reserved for commands whose meaningful outcome is side-effect-only.
- `error` is present only when `ok: false`.
- Error details still go to stderr in human-readable mode.

Examples:

```json
{
  "ok": true,
  "data": {
    "reviews": [],
    "total": 0,
    "page": 1,
    "pageSize": 20,
    "hasMore": false
  }
}
```

```json
{
  "ok": false,
  "data": null,
  "error": "No .ringi directory found under /repo"
}
```

## Error Behavior

Errors are reported with three layers of signal:

1. **stderr message** — concise explanation and recovery hint
2. **exit code** — stable automation signal
3. **optional verbose detail** — stack trace or transport detail when `--verbose` is enabled

Error rules:

- stdout is never polluted with diagnostics in normal mode
- missing review session and missing todo are not generic failures; they return exit code `3`
- missing `.ringi/` state returns exit code `4`
- validation and flag mistakes return exit code `2`
- runtime and storage failures return exit code `1`
- `--verbose` adds stack traces and transport detail to stderr only

Examples of good errors:

- `No staged changes found. Stage files or choose --source branch|commits.`
- `Review not found: rvw_01JY6Z4Y9B6GJ6T4J9M7AQ8S3R.`
- `Local state is missing at /repo/.ringi/reviews.db. Run 'ringi data migrate'.`

## Authentication

Authentication only applies to `ringi serve` when `--auth` is enabled. The model is intentionally narrow:

- HTTP basic authentication protects the local web UI and mutating HTTP endpoints
- read-only standalone CLI commands do not require auth because they read local state directly
- `ringi mcp` does not inherit `serve` auth because it is a separate stdio runtime

Expected flags:

```bash
ringi serve --auth --username reviewer --password local-dev
```

Rules:

- `--auth` requires both `--username` and `--password`
- missing credentials are a startup error
- auth is local-operator security, not a multi-user identity system

## Shell Completions

Planned command:

```bash
ringi completions <bash|zsh|fish>
```

Shell completions should cover:

- command families and subcommands
- enum values such as review source and review status
- review ids where local lookup is cheap
- global options and command-specific flags

This command is planned, not required for the initial CLI foundation.

## CLI UX Principles

A CLI for Ringi is not about color or ASCII theater. It is about operational sharpness:

- **fast startup** — read-only review session commands should feel local because they are local
- **no unnecessary output** — success confirms the action and gets out of the way
- **progressive disclosure** — default output is terse, `--json` is structured, `--verbose` is diagnostic
- **composable with Unix tools** — predictable stdout, stderr, and exit codes
- **review-first language** — commands speak in review session, review source, todo, export, provenance, relationship, group, evidence, and confidence terms instead of generic task-tracker jargon
- **honest transport semantics** — users can tell whether a command works standalone, needs the local server, or starts MCP stdio

not more commands, but a cleaner contract.