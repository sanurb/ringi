# Implementation Execution Model

## 1. Execution Model

Work proceeds one spec at a time in this exact sequence:

1. spec
2. implementation plan
3. task breakdown
4. code changes
5. validation

No spec runs in parallel with another. Each spec produces exactly one implementation document under `docs/implementation/` named `NNN-<slug>.md`.

## CLI / MCP / Code Mode Execution Model

Execution for CLI, MCP, and Code Mode surfaces proceeds one bounded slice at a time.

### Pattern

spec → implementation plan → task breakdown → code changes → validation

### Naming

`NNN-kebab-case.md` — three-digit prefix, hyphen-separated descriptor.

### Status Progression

| Status       | Meaning                                    |
| ------------ | ------------------------------------------ |
| queued       | Implementation doc exists, not yet started |
| active       | This is the current working slice          |
| implementing | Code changes in progress                   |
| validating   | Acceptance criteria being verified         |
| done         | All criteria met, slice closed             |

Exactly one doc is `active` at any time. A doc moves to `active` only when all its dependencies are `done`.

### Context-Loading Rules

1. Load ONLY the active implementation doc
2. Load the files listed in that doc's Context Pack section — nothing else
3. Never load full ARCHITECTURE.md, CLI.md, or MCP.md; load only the referenced sections
4. Each implementation session loads at most 3–4 reference docs total
5. The implementation doc IS the context boundary — it specifies exactly what to load

This discipline prevents context saturation. If an implementation session needs more context than the pack provides, the implementation doc is incomplete — fix the doc first.

### Operating Discipline

- One implementation doc = one verifiable delivery unit
- No parallel implementation across docs (parallel exploration is fine)
- Acceptance criteria must be checked before marking `done`
- If a doc's scope proves too large during implementation, split it — don't expand the session

## 2. Naming Conventions

Implementation documents use zero-padded execution order plus a stable topic slug:

- `001-review-lifecycle.md`
- `002-review-source-ingestion.md`
- `003-cli-surface-contracts.md`
- `004-mcp-execute-api.md`

Rules:

- `NNN` is the execution order, not the spec number label
- `<slug>` matches the spec topic and remains stable once created
- One spec maps to one implementation document; no split docs, no rollup docs

## 3. Status Progression

Implementation documents track exactly one status:

`queued → active → implementing → validating → done`

Status rules:

- Only one implementation document may be `active` or `implementing` at any time
- `active` means the spec is the current focus and planning is underway
- `implementing` means code changes are in progress
- `validating` means code is written and the required tests/checks are running or being resolved
- `done` means acceptance criteria are met and the work is merged
- A document may move forward only; do not recycle completed docs back to earlier states

## 4. Context-Loading Rules

When a spec becomes active, the implementation session loads only the following inputs:

1. The active spec file from `docs/specs/`
2. The context pack defined in `docs/specs/_index.md` for that spec
3. The implementation document for the active spec
4. The code files listed in that implementation document's `Likely Files` section

Hard rules:

- Do not load `docs/ARCHITECTURE.md` in full
- Do not load adjacent spec files
- Do not load `docs/roadmaps/ringi-code-intelligence-roadmap.md` unless the context pack explicitly names an excerpt from it
- Do not load `docs/CLI.md` or `docs/MCP.md` in full unless the context pack explicitly allows the full file
- If the context pack names sections, load only those sections
- If implementation uncovers unrelated work, record it as a note for the future spec's implementation document instead of expanding the current session

This rule is enforceable: any file or section outside the four allowed inputs is out of scope for the active session.

## 5. Implementation Document Structure

Every file under `docs/implementation/` follows this structure:

- Title
- Source Spec(s) — file path links
- Status — `queued`, `active`, `implementing`, `validating`, or `done`
- Objective — 2-3 sentences max
- Why Now — why this slice is sequenced here
- Likely Files — specific file paths expected to change
- Implementation Order — numbered steps
- Dependency Notes — what must exist before this starts
- Risks — what could go wrong
- Test & Validation Strategy — how to verify
- Acceptance Criteria — concrete, checkable items
- Context Pack — exact files and sections to load for the coding session

Authoring rules:

- Reference specs by file path; do not restate spec bodies
- Keep scope bounded to one delivery unit
- Record ambiguity resolutions here, not in the frozen spec files
- Keep `Likely Files` specific enough to constrain session loading

## 6. Operational Discipline

Execution rules:

- One active spec rule: never start spec `N+1` until spec `N` is `done`
- Context budget: target less than 40% context window usage for loaded docs and code context
- Spec content is frozen: implementation docs reference specs and architecture sources without duplicating them
- Ambiguity resolution belongs in the active implementation document as a brief decision note
- No scope creep: if work belongs to another spec, capture it as a note for that future implementation document and stop
- Validation is mandatory before status can move from `implementing` to `done`

Operational consequence:

- The implementation document is the execution boundary for the session. If a needed file, section, or validation step is not named there, add it deliberately before proceeding rather than widening scope implicitly.

## 7. Execution Queue

| Order | Spec                                           | Source                                            | Implementation Doc                                             | Status   |
| ----- | ---------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------- | -------- |
| 001   | SPEC-001 Review Lifecycle                      | `docs/specs/review-lifecycle.md`                  | `docs/implementation/001-review-lifecycle.md`                  | `active` |
| 002   | SPEC-002 Review Source Ingestion               | `docs/specs/review-source-ingestion.md`           | `docs/implementation/002-review-source-ingestion.md`           | `queued` |
| 003   | SPEC-003 CLI Surface Contracts                 | `docs/specs/cli-surface-contracts.md`             | `docs/implementation/003-cli-surface-contracts.md`             | `queued` |
| 004   | SPEC-004 MCP Execute API                       | `docs/specs/mcp-execute-api.md`                   | `docs/implementation/004-mcp-execute-api.md`                   | `queued` |
| 005   | SPEC-005 Persistence and Data Model            | `docs/specs/persistence-data-model.md`            | `docs/implementation/005-persistence-data-model.md`            | `queued` |
| 006   | SPEC-006 Core Service Boundaries               | `docs/specs/core-service-boundaries.md`           | `docs/implementation/006-core-service-boundaries.md`           | `queued` |
| 007   | SPEC-007 Events and Realtime                   | `docs/specs/events-realtime.md`                   | `docs/implementation/007-events-realtime.md`                   | `queued` |
| 008   | SPEC-008 Provenance and Semantic Grouping      | `docs/specs/provenance-semantic-grouping.md`      | `docs/implementation/008-provenance-semantic-grouping.md`      | `queued` |
| 009   | SPEC-009 Impact Analysis and Code Intelligence | `docs/specs/impact-analysis-code-intelligence.md` | `docs/implementation/009-impact-analysis-code-intelligence.md` | `queued` |
| 010   | SPEC-010 UI Behavior and Interaction           | `docs/specs/ui-behavior-interaction.md`           | `docs/implementation/010-ui-behavior-interaction.md`           | `queued` |

### CLI / MCP / Code Mode Queue

| Doc | Title                         | Source Spec                  | Status | Depends On |
| --- | ----------------------------- | ---------------------------- | ------ | ---------- |
| 003 | CLI Surface Contracts         | SPEC-003                     | queued | 001, 002   |
| 005 | CLI Runtime Model             | SPEC-003                     | queued | 003        |
| 004 | MCP Execute API               | SPEC-004                     | queued | 001, 002   |
| 006 | Code Mode Namespace Contracts | SPEC-004                     | queued | 004        |
| 007 | Code Mode Sandbox Runtime     | SPEC-004                     | queued | 006        |
| 008 | CLI/MCP Service Integration   | SPEC-003, SPEC-004, SPEC-006 | queued | 005, 006   |
| 009 | CLI/MCP Event Hooks           | SPEC-003, SPEC-004, SPEC-007 | queued | 008        |
