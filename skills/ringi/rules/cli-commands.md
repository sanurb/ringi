# CLI Commands

Complete reference for all Ringi CLI commands.

## serve

Start the web interface and local server.

```bash
ringi serve
ringi serve --port 4123 --no-open
```

## review create

Create a review session from a review source.

```bash
ringi review create                                          # staged (default)
ringi review create --source branch --branch main            # branch comparison
ringi review create --source commits --commits 8d2c4f1       # specific commits
```

## review list

List all review sessions in the current repository.

```bash
ringi review list
ringi review list --status approved
ringi review list --source branch --limit 10 --json
```

## review show

Show full detail for a review session.

```bash
ringi review show last
ringi review show last --comments --todos
ringi review show rvw_01JY6Z4Y9B6GJ6T4J9M7AQ8S3R --json
```

## review resolve

Approve a review — resolves all comments and marks as approved.

```bash
ringi review resolve last
ringi review resolve last --yes                              # skip confirmation
```

## review export / export

Export a review session as markdown.

```bash
ringi export last                                            # stdout
ringi export last --output review.md                         # file
ringi review export rvw_01JY6Z4Y9B6GJ6T4J9M7AQ8S3R --json
```

## review status

Show current repository and review state.

```bash
ringi review status
ringi review status --review last --json
```

## todo add

Create a todo item, optionally linked to a review.

```bash
ringi todo add --text "Write tests for auth module"
ringi todo add --text "Fix error handling" --review last
```

## todo list

List todo items.

```bash
ringi todo list
ringi todo list --review last --status all
```

## todo done / undone

Mark a todo as done or reopen it.

```bash
ringi todo done todo_01JY702YJ0D3P1KAPM9J8Q6W4E
ringi todo undone todo_01JY702YJ0D3P1KAPM9J8Q6W4E
```

## todo move / remove / clear

```bash
ringi todo move todo_01JY702YJ0D3P1KAPM9J8Q6W4E --position 1
ringi todo remove todo_01JY702YJ0D3P1KAPM9J8Q6W4E --yes
ringi todo clear --done-only --yes
```

## source list / source diff

Discover and preview review sources.

```bash
ringi source list
ringi source diff staged --stat
ringi source diff branch --branch main
```

## events

Tail the server's live event stream.

```bash
ringi events
ringi events --type files --json
```

## mcp

Start the MCP stdio server for agent integration.

```bash
ringi mcp
ringi mcp --readonly
```

## doctor

Run local diagnostics.

```bash
ringi doctor
ringi doctor --json
```

## Global Options

| Option       | Description                              |
| ------------ | ---------------------------------------- |
| `--json`     | Emit structured JSON envelope to stdout  |
| `--quiet`    | Suppress human-readable success output   |
| `--repo`     | Override repository root                 |
| `--verbose`  | Add diagnostics and stack traces         |
| `--no-color` | Disable ANSI color                       |

## Exit Codes

| Code | Meaning                                |
| ---- | -------------------------------------- |
| `0`  | Success (including empty read results) |
| `1`  | Runtime, storage, or domain failure    |
| `2`  | Usage error or invalid flags           |
| `3`  | Resource not found                     |
| `4`  | Local state unavailable                |
| `5`  | Auth failure                           |
