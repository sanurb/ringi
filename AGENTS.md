# AGENTS.md

## Task Completion Requirements

- All of `pnpm check`, `pnpm fix`, and `pnpm typecheck` must pass before considering tasks completed.

## Testing Policy

- Mocking frameworks are banned in this repository. Do not use `vi.mock()`, `vi.stubGlobal()`, or `vi.spyOn()`.
- Tests must use stub or constructor/parameter dependency injection instead.

## Project Snapshot

Ringi is becoming a local-first human review workbench for AI-generated code: a system where a reviewer can create a review session from a real git diff, inspect the diff with machine-generated provenance and evidence, understand first-order impact without leaving the review, and drive the same review state from Web UI, CLI, or MCP stdio through one shared core service layer.

This repository is a VERY EARLY WIP. Proposing sweeping changes that improve long-term maintainability is encouraged.

## Core Priorities

1. Performance first.
2. Reliability first.
3. Keep behavior predictable under load and during failures (session restarts, reconnects, partial streams).

If a tradeoff is required, choose correctness and robustness over short-term convenience.
