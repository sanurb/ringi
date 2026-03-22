# SPEC-006: Core Service Boundaries

## Status

Draft

## Purpose

Define the canonical boundary contract for Ringi's shared core service layer so review behavior stays consistent across Web UI, HTTP API, CLI, and MCP. This spec exists to stop business logic from leaking into adapters or repositories, to make transaction ownership explicit, and to separate core domain services from infrastructure adapters such as git and SSE transport.

## Scope

This spec covers:

- the responsibility and ownership of the current core services: `ReviewService`, `CommentService`, `ExportService`, `TodoService`, and `EventService`
- the adapter boundary for `GitService`
- service-to-repository ownership and dependency rules
- runtime wiring and lifecycle for server, CLI standalone, and MCP runtimes
- write transaction ownership and shared transaction context expectations
- error propagation from repositories/adapters through services to HTTP, CLI, and MCP adapters
- forbidden dependencies and current implementation gaps versus the documented architecture

## Non-Goals

This spec does not cover:

- detailed CLI verb contracts already specified in `docs/specs/cli-surface-contracts.md`
- detailed MCP tool and namespace contracts already specified in `docs/specs/mcp-execute-api.md`
- review lifecycle transition semantics already specified in `docs/specs/review-lifecycle.md`
- review source ingestion semantics already specified in `docs/specs/review-source-ingestion.md`
- intelligence/parsing services beyond the architectural references needed to keep boundaries honest
- frontend presentation concerns, HTTP route shapes, or SSE payload schema details

## Canonical References

- `docs/ARCHITECTURE.md`
  - §6 System Overview
  - §7 Operational Modes
  - §8 Core Runtime Model
  - §9 Domain Boundaries
  - §10 Component Architecture
  - §11 Data Flow
  - §13 Eventing and Realtime Strategy
  - §19 CLI / Server / Web UI / MCP Relationship
  - §22 Observability and Diagnostics
  - §24 Failure Modes
- `docs/specs/review-lifecycle.md`
  - review lifecycle ownership
  - DD-1 split lifecycle fields
  - DD-2 immutable snapshots
- `docs/specs/review-source-ingestion.md`
  - source ingestion ownership
  - immutable hunk capture
  - `GitService` adapter boundary
- `docs/specs/cli-surface-contracts.md`
  - operational mode honesty
  - command-to-service mapping
- `docs/specs/mcp-execute-api.md`
  - MCP backed by same core service layer
  - readonly enforcement is adapter-owned
- `src/routes/api/$.ts`
- `src/routes/api/-lib/db/database.ts`
- `src/routes/api/-lib/repos/review.repo.ts`
- `src/routes/api/-lib/repos/review-file.repo.ts`
- `src/routes/api/-lib/repos/comment.repo.ts`
- `src/routes/api/-lib/repos/todo.repo.ts`
- `src/routes/api/-lib/services/review.service.ts`
- `src/routes/api/-lib/services/comment.service.ts`
- `src/routes/api/-lib/services/export.service.ts`
- `src/routes/api/-lib/services/todo.service.ts`
- `src/routes/api/-lib/services/event.service.ts`
- `src/routes/api/-lib/services/git.service.ts`
- `src/routes/api/-lib/wiring/reviews-api-live.ts`
- `src/routes/api/-lib/wiring/reviews-rpc-live.ts`

## Terminology

- **Core service** — a runtime-constructed domain service that owns business logic and composes repositories and adapters.
- **Repository** — the SQLite persistence layer that performs storage access only and does not own domain decisions.
- **Adapter** — an infrastructure or transport boundary translating between external systems and the core domain model; in this spec, HTTP, CLI, MCP, SSE, and git are adapters.
- **Runtime** — one constructed Effect layer graph for a process, such as the server runtime, standalone CLI runtime, or MCP stdio runtime.
- **Transaction context** — the SQLite write boundary shared by all repository calls participating in one domain mutation.
- **Transport error mapping** — conversion of service/repository/adapter failures into HTTP responses, CLI stderr/exit codes, or MCP `execute` results.
- **Leaked requirement** — an implementation smell where a service method still requires the caller to provide repositories or adapters directly.

## Requirements

1. **REQ-006-001 — Single owner of domain logic**  
   `ReviewService`, `CommentService`, `TodoService`, `ExportService`, and `EventService` SHALL be the only owners of review-domain workflow logic in scope. Repositories SHALL NOT implement business rules, and HTTP/CLI/MCP adapters SHALL NOT implement domain logic.
2. **REQ-006-002 — Adapter-only transports**  
   Web UI, HTTP API, CLI, and MCP SHALL translate transport input/output only and SHALL call core services for domain behavior.
3. **REQ-006-003 — Git is an adapter**  
   `GitService` SHALL be treated as an infrastructure adapter, not as a review-domain service. It SHALL own repository inspection and git command execution only.
4. **REQ-006-004 — No transport awareness in services**  
   Core services SHALL NOT depend on HTTP request objects, CLI prompt state, SSE response objects, MCP sandbox state, or transport-specific auth/session context.
5. **REQ-006-005 — Runtime portability**  
   Every core service SHALL be constructible in server, standalone CLI, and MCP runtimes without code changes. Service construction SHALL depend only on repositories, adapters, config, and other core services.
6. **REQ-006-006 — Explicit service dependency graph**  
   Core services SHALL have an acyclic dependency graph. Circular dependencies between services are forbidden.
7. **REQ-006-007 — Repository ownership truthfulness**  
   Each repository SHALL have one primary owning service. Shared read access MAY exist, but domain mutation rules SHALL have one owning service.
8. **REQ-006-008 — Service-scoped write transactions**  
   A domain mutation spanning multiple repository writes SHALL start and end its transaction at the service boundary, not inside one repository method.
9. **REQ-006-009 — Ambient transaction participation**  
   Repository methods participating in a service-scoped transaction SHALL use the caller's transaction context and SHALL NOT silently start nested or unrelated write transactions.
10. **REQ-006-010 — Read services stay side-effect honest**  
    Read paths such as review export, list, show, and diff retrieval SHALL NOT mutate lifecycle state, write event rows, or re-anchor review snapshots.
11. **REQ-006-011 — Error category preservation**  
    Services SHALL preserve the distinction between domain validation failures, missing-resource failures, adapter failures, and persistence/runtime failures so adapters can map them truthfully.
12. **REQ-006-012 — Migration gate before service use**  
    Runtime construction SHALL complete SQLite initialization and migrations before write-capable services are exposed. If schema setup fails, the runtime SHALL fail closed and SHALL NOT expose partially initialized services.
13. **REQ-006-013 — Post-commit events only**  
    Any future event emission triggered by core service mutations SHALL happen after the owning transaction commits successfully.
14. **REQ-006-014 — ReviewService lifecycle ownership**  
    `ReviewService` SHALL own review creation, snapshot anchoring, review detail retrieval, hunk retrieval from persisted snapshot data, and lifecycle transition entrypoints.
15. **REQ-006-015 — ExportService is snapshot-only**  
    `ExportService` SHALL render exports from persisted review, comment, and todo state and SHALL NOT call git or recompute review snapshot inputs.
16. **REQ-006-016 — EventService is transport-adjacent infrastructure**  
    `EventService` SHALL own event fanout, subscriptions, and watcher integration but SHALL NOT decide review lifecycle or repository business rules.
17. **REQ-006-017 — Service encapsulation**  
    A service's public methods SHALL NOT leak repository or adapter runtime requirements to adapters. The runtime builder SHALL provide a service; adapters SHALL not need to know the service's internals.
18. **REQ-006-018 — Standalone read honesty**  
    Standalone CLI reads SHALL be able to construct only the services they need without requiring HTTP server wiring or live event infrastructure.
19. **REQ-006-019 — Forbidden git bypass**  
    No core service SHALL shell out to git directly outside `GitService`.
20. **REQ-006-020 — Forbidden live re-diff for anchored reviews**  
    After review creation, no core service SHALL re-run git diff commands to answer hunk reads for anchored reviews created after the snapshot cutover defined in SPEC-002.

## Workflow / State Model

### 1. Target runtime wiring model

```text
Server runtime (`ringi serve`)
  HTTP adapter
  RPC adapter
  SSE adapter
    -> core services
    -> repositories
    -> GitService adapter
    -> SQLite service

Standalone CLI runtime
  CLI adapter
    -> selected read-capable core services
    -> repositories
    -> GitService adapter (only when the read contract needs repository state)
    -> SQLite service

MCP runtime (`ringi mcp`)
  MCP stdio adapter
    -> same core services
    -> repositories
    -> GitService adapter
    -> SQLite service
```

### 2. Target service dependency graph

```text
                  +----------------+
                  |   GitService   |  adapter only
                  +--------^-------+
                           |
+---------------+          |          +----------------+
| CommentRepo   |<--+      |      +-->|   ReviewRepo   |
+---------------+   |      |      |   +----------------+
                    |      |      |
+---------------+   |      |      |   +----------------+
| TodoRepo      |<--+      |      +-->| ReviewFileRepo |
+---------------+   |      |          +----------------+
                    |      |
+----------------+  |      |      +----------------+
| CommentService |--+      +------| ReviewService  |
+----------------+                 +----------------+
        ^                                   ^
        |                                   |
        |                           +-------+
        |                           |
+----------------+          +----------------+
|  TodoService   |----------| ExportService  |
+----------------+          +----------------+

+----------------+
|  EventService  |  infrastructure service; may be called by adapters or
+----------------+  future post-commit orchestration, but must not create cycles
```

### 3. Forbidden dependency rules

- Adapters MAY depend on core services; core services MUST NOT depend on adapters.
- Repositories MUST NOT depend on services.
- `GitService` MUST NOT depend on repositories or other domain services.
- `ReviewService` MUST NOT depend on `ExportService`, `CommentService`, or `TodoService` for lifecycle truth.
- `CommentService` and `TodoService` MUST NOT depend on `ExportService` or `EventService` for core mutation success.
- `ExportService` MAY depend on read methods of `ReviewService`, `CommentService`, and `TodoService`; those services MUST NOT depend back on `ExportService`.
- `EventService` MUST NOT depend on `ReviewService`, `CommentService`, or `TodoService` to decide what happened; it only transports already-decided facts.
- No service may read transport-local mutable state such as `Request`, TTY status, MCP code string, or SSE subscriber internals.

### 4. Write transaction sequence

For a multi-repository mutation such as review creation:

```text
adapter calls ReviewService.create
  -> ReviewService validates input and acquires git snapshot inputs through GitService
  -> ReviewService starts one transaction context
  -> ReviewRepo persists review row in that context
  -> ReviewFileRepo persists review_files rows in the same context
  -> transaction commits once
  -> post-commit effects may run (analysis enqueue, event publish)
  -> service returns committed domain result
```

### 5. Error propagation sequence

```text
adapter request
  -> service method
    -> repository and/or GitService calls
      -> typed domain error / not-found / adapter error / persistence defect
    -> service either handles and reclassifies or propagates faithfully
  -> adapter maps to HTTP status, CLI stderr+exit code, or MCP execute error envelope
```

### 6. Current implementation gaps versus this model

- `ReviewService.create()` writes the review row through `ReviewRepo.create()` and then writes files through `ReviewFileRepo.createBulk()`, but these are not one shared transaction. `ReviewFileRepo.createBulk()` starts its own transaction after the review row already exists.
- `ReviewService.getFileHunks()` re-runs `git.getBranchDiff()` and `git.getCommitDiff()` for branch and commit reviews when `hunks_data` is absent, which violates SPEC-002 immutable snapshot anchoring.
- `ReviewService` shells out with local helper `getHeadSha()` using `execFile("git", ...)` instead of routing that operation through `GitService`, violating the adapter boundary.
- `ReviewService.update(id, status)` is still a generic status mutation even though SPEC-001 replaces coarse status mutation with explicit lifecycle ownership.
- `ExportService` renders `review.status` and does not persist export facts, so export remains coupled to the legacy lifecycle field.
- `EventService.startFileWatcher()` exists but no call site in `src/routes/api/$.ts` or other source invokes it, so architecture §13 watcher wiring is not actually booted.
- `src/routes/api/$.ts` builds one shared `ServiceLayers` runtime for the server, but no equivalent standalone CLI runtime or MCP runtime bootstrap is present in the current source tree.
- `src/routes/api/-lib/wiring/reviews-api-live.ts` and `reviews-rpc-live.ts` explicitly document that `ReviewService` methods leak `ReviewRepo`, `ReviewFileRepo`, and `GitService` runtime requirements to callers; that violates service encapsulation.
- `SqliteService` always runs migrations during construction. **AMBIGUITY:** architecture and SPEC-003 require standalone read-only CLI behavior, but current source shows no read-only bootstrap path that opens SQLite without migration side effects.
- `docs/ARCHITECTURE.md` names a Source bounded context, but current code has no separate `SourceService`; source resolution currently lives inside `ReviewService` plus `GitService`. **AMBIGUITY:** whether to extract a dedicated source service now or keep source ingestion inside `ReviewService` until a second consumer needs more than git passthrough.

## API / CLI / MCP Implications

### HTTP API

- HTTP handlers in `src/routes/api/-lib/wiring/*.ts` SHALL stay thin and call services only.
- HTTP adapters SHALL own request decoding, endpoint schema declaration, and response encoding.
- HTTP adapters SHALL NOT hide undeclared service errors as defects long-term. Current `ReviewsApiLive` and `ReviewsRpcLive` `Effect.die(...)` behavior for `GitError` and `ReviewError` is a temporary gap, not the target contract.

### CLI

- CLI standalone reads SHALL construct only the read-capable services needed for the command, consistent with SPEC-003.
- CLI mutation commands SHALL route through the server-connected path rather than constructing a second write-capable orchestration path in the CLI adapter.
- CLI adapter code SHALL own selector resolution (`last`), TTY confirmation, output formatting, and exit code mapping, not domain services.

### MCP

- MCP `execute` SHALL expose the same core service behavior as human-facing surfaces, per SPEC-004.
- MCP readonly enforcement SHALL remain adapter-owned; services SHOULD stay transport-neutral.
- MCP namespace methods SHALL not bypass services to hit repositories directly.

### Shared implication

- All three surfaces SHALL observe the same review truth because they are backed by the same service contracts and repository model.

## Data Model Impact

This spec does not introduce new tables or columns by itself.

It does require repository-contract changes to support truthful service boundaries:

- repositories participating in one domain mutation need an ambient transaction mechanism instead of each repository deciding independently when to call `withTransaction(...)`
- review export and lifecycle services need to converge on the split lifecycle fields defined in SPEC-001 instead of the current coarse `reviews.status`
- no repository contract should require HTTP, CLI, MCP, or git-specific types

Repository ownership map:
| Service | Primary repositories owned | Adapters consumed | Notes |
| --- | --- | --- | --- |
| `ReviewService` | `ReviewRepo`, `ReviewFileRepo` | `GitService` | Owns review snapshot creation/read and lifecycle entrypoints |
| `CommentService` | `CommentRepo` | none | Owns comment/suggestion mutation semantics |
| `TodoService` | `TodoRepo` | none | Owns todo CRUD and ordering |
| `ExportService` | none directly | reads through `ReviewService`, `CommentService`, `TodoService` | Read-only composition service |
| `EventService` | none in current source | filesystem watcher, in-memory queues | Infrastructure fanout service |
| `GitService` | none | `git` CLI, filesystem reads, config | Adapter only; not a domain owner |

## Service Boundaries

### ReviewService

Owns:

- review creation from validated review source input
- snapshot anchoring and persisted review-file metadata
- review list/detail reads
- lifecycle entrypoints and lifecycle-safe mutations
- hunk reads from persisted snapshot data

Must not own:

- HTTP endpoint semantics
- CLI prompt behavior
- MCP readonly policy
- SSE subscription management
- raw git process execution outside `GitService`

### CommentService

Owns:

- comment creation, update, resolution, unresolution, and removal
- comment statistics for one review
- suggestion storage insofar as suggestions are comment-owned in current source

Must not own:

- review lifecycle decisions beyond its own comment state
- export formatting
- HTTP query parsing

### TodoService

Owns:

- todo creation, update, completion state, ordering, and removal
- todo list and todo stats

Must not own:

- review export rendering
- review approval decisions by itself
- CLI verb naming or confirmation logic

### ExportService

Owns:

- read-only composition of persisted review, comment, and todo state into export output
- export rendering policy for snapshot-backed audit output

Must not own:

- lifecycle transition side effects unless explicitly specified by SPEC-001
- git diff refresh
- direct repository writes in the current contract

### EventService

Owns:

- subscriber registration and fanout
- watcher lifecycle once runtime boot explicitly starts it
- event transport payload broadcasting

Must not own:

- deciding whether a review is approved, ready, or exported
- mutating review/comment/todo rows
- reading transport-specific state from HTTP handlers or CLI adapters

### GitService

Owns:

- git diff acquisition
- branch and commit discovery
- repository metadata and top-level path discovery
- staged file content, HEAD content, and working tree reads

Must not own:

- lifecycle fields
- review persistence
- export rendering
- degraded capture policy
- transport error mapping

## Edge Cases

- **Service called without DB connection** — runtime construction MUST fail before exposing services. Adapters MUST not attempt partial fallback with half-initialized services.
- **Service called during migration** — migrations run in `SqliteService` construction today; write-capable services MUST remain unavailable until migration completes successfully.
- **Standalone mode bootstrap** — **AMBIGUITY:** current source does not show a read-only SQLite bootstrap path separate from migration-running `SqliteService`. Proposed resolution: add a read-only runtime constructor for standalone commands and keep write-capable migration bootstrap in server/MCP runtimes.
- **Circular dependency pressure** — export must read review/comment/todo state without those services depending back on export. Any future lifecycle reopening logic triggered by comments/todos must flow through explicit orchestration, not by creating service cycles.
- **Adapter failure vs domain failure** — git command failure from `GitService` is an adapter failure; invalid review source or lifecycle precondition is a domain failure. Adapters MUST map them differently.
- **Missing review during comment/todo/export path** — service MUST return typed not-found errors instead of empty success values.
- **Watcher boot omission** — if the runtime omits `startFileWatcher()`, read/write services still function, but SSE freshness guarantees from architecture §13 do not. This is a degraded runtime, not a different domain model.
- **Nested transaction risk** — repository-owned transactions inside a service-owned transaction can produce partial commits or misleading atomicity. The transaction owner must be singular.
- **Schema drift between runtimes** — server, CLI, and MCP MUST not construct different service graphs that disagree on repository or adapter behavior.

## Observability

Structured diagnostics SHOULD record:

- runtime bootstrap success/failure for server, CLI standalone, and MCP
- SQLite open path, WAL mode, and migration success/failure
- service-layer write transaction begin/commit/rollback for multi-repo mutations
- adapter failure category (`git`, `sqlite`, `transport`, `domain-validation`, `not-found`)
- watcher start/stop health and last event timestamp
- service dependency graph or runtime composition used during `ringi doctor`

Minimum logging expectations:

- `ReviewService.create` logs source type, repository path, file count, and transaction outcome
- `ExportService.exportReview` logs review id and export outcome
- `EventService` logs watcher startup and subscriber counts
- transport adapters log mapped error category, not just generic failure text

## Rollout Considerations

1. Keep the current service set but enforce the boundary cutover first: services own domain logic, repos own storage, adapters own transport.
2. Remove direct git shelling from `ReviewService` and route all git access through `GitService`.
3. Introduce ambient transaction support so `ReviewService.create()` can commit review row and review-file rows atomically.
4. Delete generic review status mutation once SPEC-001 lifecycle entrypoints land in code.
5. Update `ExportService` to consume the split lifecycle model and persisted export facts when that schema lands.
6. Extract shared runtime construction so server, standalone CLI, and MCP all build from one service graph recipe with mode-specific capabilities.
7. Wire `EventService.startFileWatcher()` explicitly during server boot after runtime initialization succeeds.
8. Tighten API and RPC schemas so domain and adapter errors are surfaced as declared failures instead of `die` defects.

## Open Questions

1. **AMBIGUITY:** Should Ringi introduce a dedicated `SourceService` now, or keep source ingestion inside `ReviewService` plus `GitService`?  
   Proposed resolution: keep `ReviewService` as the owner of source-ingestion orchestration for now, because the current source tree has only one concrete consumer and SPEC-002 already defines `GitService` as the adapter boundary. Extract `SourceService` only when a second consumer needs source normalization beyond review creation.
2. **AMBIGUITY:** How should ambient transaction context be represented in Effect?  
   Proposed resolution: extend `SqliteService` with a transaction runner/context API and update repositories to accept an optional transaction-scoped handle instead of each repository starting its own `withTransaction(...)` blindly.
3. **AMBIGUITY:** Should event publication live inside mutating services or in an outer orchestration layer?  
   Proposed resolution: allow service-owned post-commit event publication for domain events, but require it to happen only after commit and through `EventService` so adapters do not infer domain events themselves.
4. **AMBIGUITY:** How should standalone read-only CLI mode avoid running migrations while still detecting incompatible schema?  
   Proposed resolution: add an explicit read-only SQLite bootstrap that validates schema version without applying migrations, and reserve migration execution for write-capable runtimes.
5. **AMBIGUITY:** Should `ExportService` stay read-only forever, or should it later record export audit rows directly?  
   Proposed resolution: keep `ExportService` read-only until SPEC-001 export persistence lands; then let it write only export-fact records, not review lifecycle shortcuts.

## Acceptance Criteria

- `docs/specs/core-service-boundaries.md` exists.
- The spec contains all mandatory sections required by the assignment.
- The spec names every current core service in scope and identifies `GitService` as an adapter, not a core domain service.
- The spec contains a service dependency graph and explicit forbidden dependency rules.
- The spec maps each service to its owned repositories and consumed adapters.
- The spec defines where transactions begin and end for multi-repo mutations.
- The spec defines how errors propagate from adapters/repositories through services to HTTP, CLI, and MCP surfaces.
- The spec defines runtime wiring expectations for server, standalone CLI, and MCP runtimes.
- The spec explicitly states that services must not depend on HTTP context, CLI state, or MCP sandbox state.
- The spec identifies current implementation gaps, including uninvoked `EventService.startFileWatcher()`, non-atomic review creation, leaked service requirements, and direct git bypass in `ReviewService`.
