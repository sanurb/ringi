# SPEC-009: Impact Analysis and Code Intelligence

## Status

Draft

## Purpose

Define Ringi's implementation-grade contract for review-scoped intelligence: how a persisted review snapshot is analyzed during `workflow_state = 'analyzing'`, how the resulting impact and confidence artifacts are stored, how those artifacts drive the impact minimap and graph-diff bridging, and how the same artifacts are exposed to UI, CLI, and MCP without turning Ringi into a generic code exploration product.

This spec closes the gap between the documented architecture in `docs/ARCHITECTURE.md`, the MCP surface in `docs/MCP.md`, and the current `src/` tree, which has review, comment, todo, export, event, git, and diff services but no shipped intelligence service or intelligence persistence yet.

## Scope

This spec covers:

- review-scoped intelligence bounded to one persisted review snapshot and its immediate blast radius
- the analysis pipeline executed between `created -> analyzing -> ready`
- impact minimap artifacts and graph-diff bridging artifacts
- persistence for review-scoped relationships, impacts, confidence inputs, and analyzer runs
- MCP `intelligence` namespace behavior backed by persisted review artifacts
- service ownership for the intelligence pipeline and its interaction with `ReviewService` and `GitService`
- extensibility rules for adding new analyzers without changing higher-layer review contracts
- failure, timeout, invalidation, and partial-result behavior for intelligence generation

## Non-Goals

This spec does not cover:

- generic repository exploration, full-codebase navigation, or IDE-like code intelligence
- a persistent global repository knowledge graph
- arbitrary code search, semantic search, or full-text search as a product surface
- automatic code mutation or auto-application of fixes from intelligence results
- cross-review aggregation of graph artifacts
- compiler-grade whole-repository analysis in v1
- UI pixel design for the minimap beyond the data contract it consumes

## Canonical References

- `docs/ARCHITECTURE.md`
  - §1, §2, §3 — review-scoped intelligence as a product pillar
  - §9 — Intelligence bounded context ownership
  - §10 — core intelligence services and parsing layer
  - §11 — persistence before analysis exposure
  - §16 — diff processing pipeline
  - §17 — code intelligence boundaries
  - §18 — agent integration strategy
  - §21 — parser and namespace extensibility
  - §22, §23, §24, §25 — observability, performance, failure modes, evolution path
- `docs/MCP.md`
  - `intelligence` namespace method contracts
  - `execute({ code, timeout? })` timeout and truncation rules
- `docs/specs/review-lifecycle.md`
  - DD-1 split lifecycle fields
  - DD-2 immutable snapshots
  - lifecycle transitions `created -> analyzing -> ready`
- `docs/specs/review-source-ingestion.md`
  - immutable source anchoring and persisted hunks as analysis input
- `docs/specs/mcp-execute-api.md`
  - REQ-004-025 review-scoped intelligence only
  - phase-unavailable behavior until intelligence services are shipped
- `docs/specs/core-service-boundaries.md`
  - Intelligence bounded context references
  - `ReviewService` / `GitService` ownership rules
- `docs/roadmaps/ringi-code-intelligence-roadmap.md`
  - Phase 1.5 Trust Layer
  - Phase 2 Deep Intelligence
  - storage, risks, and MCP intelligence tools
- `src/routes/api/-lib/services/review.service.ts`
- `src/routes/api/-lib/services/diff.service.ts`
- `src/routes/api/-lib/services/git.service.ts`
- `src/routes/api/-lib/db/migrations.ts`
- `src/routes/api/-lib/repos/review.repo.ts`
- `src/routes/api/-lib/repos/review-file.repo.ts`
- `src/api/schemas/review.ts`

## Terminology

- **Review-scoped intelligence** — analysis limited to one persisted review snapshot and its immediate blast radius, never the whole repository as a first-class product model.
- **Immediate blast radius** — unchanged files or symbols directly connected to changed review files by first-order relationships such as imports, calls, re-exports, renames, configuration linkage, or test coverage references.
- **Analyzer** — one deterministic pipeline step that reads the review snapshot plus bounded repository context and emits structured artifacts such as relationships, impact coverage, provenance enrichment, or confidence inputs.
- **Analyzer run** — one persisted execution record for a named analyzer against one review snapshot, including success, failure, timeout, duration, and output summary.
- **Relationship** — a review-scoped edge connecting one changed file to another file in the same review or to an unchanged dependent outside the diff, always with inspectable evidence.
- **Evidence** — structured proof supporting a relationship or confidence signal, such as matched import text, extracted symbol references, file-path heuristics, or parser-derived metadata.
- **Impact minimap** — the persisted review-scoped structure that summarizes changed files, impacted dependents, uncovered dependents, confidence, and bridge targets for UI rendering.
- **Graph-diff bridging** — bidirectional linking between graph/intelligence nodes and diff/file views so selection, highlighting, and evidence jumps stay anchored in the review.
- **Partial intelligence** — a review whose raw snapshot is valid and reviewable, but where one or more analyzers failed, timed out, or were skipped under configured bounds.
- **Stale intelligence** — persisted intelligence artifacts generated from an earlier snapshot or row version and therefore no longer authoritative for the current review snapshot.

## Requirements

1. **REQ-009-001 — Review-scoped boundary**  
   Intelligence SHALL be review-scoped only. It SHALL answer what the current review snapshot affects and why, and SHALL NOT expose generic repository exploration or persistent whole-codebase graph behavior.
2. **REQ-009-002 — Snapshot-bound inputs**  
   Every analyzer SHALL read from the immutable review snapshot defined by SPEC-001 and SPEC-002. For changed files, persisted `review_files` hunks are authoritative. An analyzer SHALL NOT re-diff live git for the same review.
3. **REQ-009-003 — Bounded repository context**  
   An analyzer MAY inspect bounded repository context outside the diff only to compute first-order dependents or evidence for the current review. It SHALL NOT build or persist a repository-wide graph detached from a review.
4. **REQ-009-004 — Persistence before readiness**  
   The review SHALL NOT enter `workflow_state = 'ready'` until the initial intelligence pipeline completes or explicitly records partial/degraded results for every required analyzer.
5. **REQ-009-005 — Required analyzer accounting**  
   Each required analyzer SHALL persist one analyzer-run record with `success`, `failed`, `timed_out`, or `skipped` status. Missing runs SHALL be treated as pipeline failure, not as implicit success.
6. **REQ-009-006 — Partial results stay explicit**  
   If one or more analyzers fail or time out, the review MAY still enter `ready` only if the raw review snapshot is valid and the failed analyzers are recorded explicitly as partial intelligence. The system SHALL NOT pretend the intelligence set is complete.
7. **REQ-009-007 — Evidence required for displayed edges**  
   Any relationship shown through UI or MCP SHALL include inspectable evidence. Relationships without evidence MAY be stored only as unsupported diagnostics and SHALL NOT be presented as authoritative review intelligence.
8. **REQ-009-008 — Impact minimap contract**  
   The system SHALL persist a queryable impact minimap structure per review snapshot that identifies changed files, impacted dependents, uncovered dependents, confidence, and graph-diff bridge targets.
9. **REQ-009-009 — Graph-diff bridge contract**  
   Every minimap node and relationship exposed to UI or MCP SHALL be mappable back to a concrete review file or evidence location so the graph never drifts away from the diff.
10. **REQ-009-010 — MCP parity**  
    The MCP `intelligence` namespace SHALL be backed by the same persisted review intelligence artifacts used by the UI and CLI. MCP SHALL NOT receive a separate shadow analysis model.
11. **REQ-009-011 — Phase honesty**  
    Until the intelligence pipeline and persistence exist in `src/`, `intelligence` namespace calls SHALL fail as phase unavailable per SPEC-004 instead of returning synthetic or empty-success responses.
12. **REQ-009-012 — No-change review behavior**  
    A review with no code files eligible for intelligence analysis SHALL record an explicit no-op intelligence summary rather than running analyzers that require code structure.
13. **REQ-009-013 — Invalidation on snapshot change**  
    Any review source refresh, recreated snapshot, or other snapshot-changing operation SHALL invalidate prior intelligence artifacts. Artifacts from an older snapshot or row version SHALL be marked stale and SHALL NOT be served as current review truth.
14. **REQ-009-014 — Cost bounds**  
    Intelligence execution SHALL honor configured file-count, relationship-count, and analyzer-time budgets. When budgets are exceeded, the system SHALL degrade explicitly by skipping or truncating analyzers and recording the reason.
15. **REQ-009-015 — Deterministic outputs**  
    Given the same review snapshot and analyzer configuration, intelligence outputs SHALL be deterministic so UI rendering, export reasoning, and MCP validation stay reproducible.
16. **REQ-009-016 — Analyzer extensibility**  
    New analyzers SHALL plug into the intelligence pipeline through a stable normalized artifact contract. Adding an analyzer SHALL NOT require changing review creation adapters or the `execute` transport.
17. **REQ-009-017 — Confidence is inspectable**  
    Confidence scores SHALL be derived from provenance quality, evidence quality, and mechanical-change signals as described in the roadmap. Opaque scores without reasons are forbidden.
18. **REQ-009-018 — Service isolation**  
    Intelligence generation SHALL be owned by intelligence services, not by transport adapters or repositories. `ReviewService` owns lifecycle orchestration; `GitService` owns raw repository inspection only.
19. **REQ-009-019 — Large review survival**  
    If a review is too large for full graph extraction within configured budgets, the review SHALL remain reviewable from raw diff and comments. Intelligence degradation SHALL never corrupt or block raw diff access.
20. **REQ-009-020 — Observability of failure**  
    Timeouts, skipped analyzers, stale artifacts, and partial intelligence SHALL be visible through structured diagnostics and review-scoped status reads.

## Workflow / State Model

### Intelligence pipeline in lifecycle context

Per SPEC-001, review creation persists the snapshot first. Intelligence then executes inside the review lifecycle boundary.

```text
source ingestion complete
  -> ReviewService persists review + review_files snapshot
  -> workflow_state = 'created'
  -> ReviewService starts intelligence orchestration
  -> workflow_state = 'analyzing'
  -> intelligence pipeline runs required analyzers
       1. snapshot load and analyzer planning
       2. changed-file classification
       3. relationship extraction with evidence
       4. impact derivation for immediate dependents
       5. minimap + bridge artifact assembly
       6. confidence derivation and partial-result summary
       7. analyzer-run persistence
  -> if pipeline accounting complete
       -> persist intelligence summary on review snapshot
       -> workflow_state = 'ready'
     else
       -> stay 'analyzing' only while run is active
       -> on fatal orchestration defect fail transition truthfully
```

### Required pipeline stages

1. **Plan** — enumerate analyzers appropriate for the review snapshot from source type, changed files, and language/file eligibility.
2. **Extract relationships** — derive first-order relationships from changed files using the current parser layer.
3. **Bridge to diff** — attach every relationship and impact node to concrete `review_file` ids and evidence locations.
4. **Derive impacts** — compute impacted changed files and unchanged dependents inside the allowed blast radius.
5. **Derive confidence** — produce file-level or group-level confidence with reasons.
6. **Persist runs and summary** — record analyzer runs, artifacts, and partial/degraded summary.

### Transition rules

- `created -> analyzing` is entered after snapshot persistence succeeds and before analyzer execution begins.
- `analyzing -> ready` requires complete accounting for required analyzers, not universal analyzer success.
- If the intelligence orchestrator crashes before accounting is written, the review SHALL remain `analyzing` until recovery or retry determines the truth.
- **AMBIGUITY:** SPEC-001 defines `analyzing -> ready` as an internal `ReviewService.create()` step. Current `src/routes/api/-lib/services/review.service.ts` does not implement any intelligence stage yet. This spec defines the target cutover contract; implementation must move from the current coarse `status = 'in_progress'` model to split lifecycle ownership before these states can be observed truthfully.

### Partial-result rule

`ready` does not mean every analyzer succeeded. It means the snapshot is reviewable, required analyzer accounting exists, and any gaps are explicit. That preserves workflow truth without lying about intelligence completeness.

## API / CLI / MCP Implications

### UI and CLI

- UI surfaces such as grouped file tree and impact minimap SHALL read persisted review-scoped intelligence, not recompute graph data client-side.
- CLI read paths MAY expose intelligence summaries later, but they SHALL read the same persisted artifacts used by UI and MCP.
- Review status or diagnostics views SHOULD surface whether intelligence is complete, partial, stale, or phase unavailable.

### MCP `intelligence` namespace

The MCP contract comes from `docs/MCP.md` and SPEC-004. This spec fixes how those calls map to persisted artifacts.

```ts
type RelationshipKind =
  | "imports"
  | "calls"
  | "re_exports"
  | "renames"
  | "configuration"
  | "test_coverage";

type ValidateOptions = {
  reviewId: string;
  checks?: Array<
    | "changed_exports"
    | "unresolved_comments"
    | "impact_coverage"
    | "confidence_gaps"
  >;
};

interface IntelligenceNamespace {
  getRelationships(reviewId: string): Promise<Relationship[]>;
  getImpacts(reviewId: string): Promise<ImpactRecord[]>;
  getConfidence(reviewId: string): Promise<ConfidenceScore[]>;
  validate(options: ValidateOptions): Promise<ValidationResult>;
}
```

#### Method implications

- `getRelationships(reviewId)` SHALL return only persisted review-scoped relationships tied to the current snapshot.
- `getImpacts(reviewId)` SHALL return the impact minimap input set, including `impactedBy`, `uncoveredDependents`, and confidence.
- `getConfidence(reviewId)` SHALL return inspectable reasons, not just numeric scores.
- `validate(options)` SHALL execute deterministic checks over persisted review state plus intelligence artifacts. A timeout or phase-unavailable result is inconclusive and SHALL NOT be reported as successful validation.

#### Phase behavior

- Before intelligence services are implemented, all four methods SHALL fail as phase unavailable per SPEC-004.
- Once implemented, readonly enforcement remains adapter-owned, but all current `intelligence` methods are read-only by contract.

## Data Model Impact

This spec extends the persistence direction documented in `docs/ARCHITECTURE.md` §12 and the roadmap storage guidance.

### Reviews table

`reviews` remains the snapshot anchor. Intelligence-specific summary fields SHOULD be additive and versioned rather than replacing snapshot truth.

Recommended additive fields:

- `intelligence_status` — `pending | complete | partial | stale | unavailable`
- `intelligence_summary` — versioned JSON summary of analyzer accounting and top-level counts

**AMBIGUITY:** `docs/ARCHITECTURE.md` and the roadmap establish storage direction but do not yet define exact `reviews` DDL for intelligence summary columns. Current `src/routes/api/-lib/db/migrations.ts` contains no such columns. This spec requires additive summary storage; the exact column-vs-derived-view split remains open.

### `review_files`

The roadmap already points to `review_files` as the first place for provenance, confidence payload, and grouping key. This spec requires additive, review-scoped intelligence fields on changed files.

Recommended additive fields:

- `provenance_data TEXT NULL` — versioned structured provenance payload
- `confidence_data TEXT NULL` — versioned structured confidence payload
- `group_key TEXT NULL` — stable grouping/minimap bucket key

### `review_relationships`

Create a dedicated table for queryable review-scoped edges instead of burying all graph data in opaque JSON.

```sql
CREATE TABLE review_relationships (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  snapshot_id TEXT NOT NULL,
  source_file_id TEXT NOT NULL REFERENCES review_files(id) ON DELETE CASCADE,
  source_path TEXT NOT NULL,
  target_path TEXT NOT NULL,
  target_file_id TEXT REFERENCES review_files(id) ON DELETE SET NULL,
  relation_kind TEXT NOT NULL CHECK (
    relation_kind IN ('imports', 'calls', 're_exports', 'renames', 'configuration', 'test_coverage')
  ),
  target_scope TEXT NOT NULL CHECK (target_scope IN ('changed', 'dependent')),
  evidence_data TEXT NOT NULL,
  confidence_score REAL,
  analyzer_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;
```

### `review_impacts`

Persist minimap-ready impact records so UI and MCP do not have to recompute blast radius on every read.

```sql
CREATE TABLE review_impacts (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  snapshot_id TEXT NOT NULL,
  file_id TEXT NOT NULL REFERENCES review_files(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  impact_kind TEXT NOT NULL CHECK (impact_kind IN ('changed', 'dependent', 'uncovered_dependent')),
  impacted_by_data TEXT NOT NULL,
  uncovered_dependents_data TEXT NOT NULL,
  confidence_data TEXT,
  minimap_node_data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;
```

### `review_analyzer_runs`

Persist execution truth for every analyzer.

```sql
CREATE TABLE review_analyzer_runs (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  snapshot_id TEXT NOT NULL,
  analyzer_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'timed_out', 'skipped')),
  duration_ms INTEGER NOT NULL,
  output_summary TEXT,
  error_message TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL
) STRICT;
```

### Impact minimap data structure

The persisted `minimap_node_data` SHALL normalize to the following shape regardless of storage layout:

```ts
type ImpactMinimapNode = {
  fileId: string;
  path: string;
  status: "changed" | "dependent" | "uncovered_dependent";
  groupKey: string | null;
  impactedBy: string[];
  uncoveredDependents: string[];
  confidence: {
    score: number | null;
    reasons: string[];
  };
  bridge: {
    reviewFileId: string | null;
    evidenceIds: string[];
    selectable: boolean;
  };
};
```

This shape is intentionally aligned with `docs/MCP.md` `getImpacts()` while adding the bridge fields required for UI graph-diff synchronization.

## Service Boundaries

- **ReviewService owns** lifecycle orchestration around intelligence: entering `analyzing`, invoking the intelligence pipeline against a persisted snapshot, and transitioning to `ready` once analyzer accounting is complete.
- **Intelligence services own** analyzer planning, relationship extraction, impact derivation, graph-diff bridge assembly, confidence derivation, and persistence of intelligence artifacts.
- **GitService owns** repository inspection required by analyzers for bounded dependent lookup or file content reads outside the changed diff. It MUST NOT own intelligence persistence, lifecycle state, minimap semantics, or confidence rules.
- **Repositories own** storage access only. They MUST NOT derive graph semantics, confidence, or lifecycle truth.
- **Adapters own** transport mapping only. HTTP/CLI/MCP MUST NOT run their own intelligence logic.

**AMBIGUITY:** `docs/specs/core-service-boundaries.md` names intelligence services architecturally, but current `src/routes/api/-lib/services/` contains no shipped intelligence service. This spec defines the missing target boundary. Implementation may introduce `IntelligenceService` and language-specific analyzer modules, but it MUST preserve the ownership split above.

## Edge Cases

- **Analyzer timeout** — if an analyzer exceeds budget, persist `review_analyzer_runs.status = 'timed_out'`, mark intelligence partial, and keep the raw review usable. The timeout does not imply validation success or failure.
- **Review stuck in `analyzing`** — if orchestration crashes before analyzer accounting is persisted, diagnostics MUST show an incomplete run. Recovery MUST either retry the pipeline or mark the review partial/stale; it MUST NOT silently flip to `ready`.
- **Partial analyzer failure** — one failed analyzer does not invalidate snapshot anchoring. Persist the failure, exclude unsupported artifacts from authoritative reads, and expose partial status.
- **Doc-only or non-code review** — if the review contains no files eligible for structure extraction, persist a no-op intelligence summary and move to `ready` without fabricating relationships.
- **Stale intelligence after source changes** — when a review snapshot changes, previously persisted intelligence becomes stale immediately. Old artifacts MAY remain for audit/debugging but SHALL NOT be served as current review truth.
- **Very large change sets** — when file-count or relationship-count budgets are exceeded, analyzers MAY skip dependent expansion or confidence derivation, but they MUST record the degradation reason.
- **Evidence mismatch** — if a heuristic edge is detected but no inspectable evidence can be attached, downgrade or discard the edge; do not display it as authoritative.
- **No intelligence service in current source** — current MCP intelligence methods are documented but not implemented. Until storage and service layers exist, phase-unavailable is the only truthful behavior.

## Observability

Structured diagnostics SHALL record:

- review id, snapshot id, and row version used for analysis
- analyzer names selected for the review
- per-analyzer status, duration, and error/timeout reason
- counts of changed files, dependent files, displayed relationships, unsupported relationships, and uncovered dependents
- whether intelligence finished as `complete`, `partial`, `stale`, or `unavailable`
- graph-diff bridge counts: bridged nodes, bridged edges, orphaned evidence records
- budget-triggered degradation events

`ringi doctor` or equivalent local diagnostics SHOULD surface:

- reviews currently stuck in `analyzing`
- reviews with partial or stale intelligence
- analyzer timeout counts
- percentage of displayed relationships with evidence
- last successful intelligence run timestamp per review

## Rollout Considerations

1. Land SPEC-001 lifecycle cutover first so `created`, `analyzing`, and `ready` can be represented truthfully.
2. Land SPEC-002 immutable snapshot cutover first so analyzers consume anchored hunks instead of live git re-diffs.
3. Add intelligence persistence tables and additive `review_files` fields before exposing UI or MCP intelligence reads.
4. Ship parser/extractor layer behind a stable normalized artifact contract, starting with the roadmap's regex-based extraction.
5. Expose `intelligence` namespace methods only after persisted artifacts exist; before that, keep phase-unavailable behavior.
6. Keep graph scope review-centric during Phase 1.5 and Phase 2; do not introduce repository-wide graph indexing as a prerequisite.
7. Preserve raw diff review usability throughout rollout. Intelligence is an additive trust layer, not a gate that can break review access.

## Open Questions

1. **AMBIGUITY:** Should `intelligence_status` live as explicit columns on `reviews`, inside versioned `snapshot_data`, or as a derived projection from analyzer runs?  
   Current docs require truthful status but do not yet fix the exact storage shape.
2. **AMBIGUITY:** Should impact minimap nodes be stored in a dedicated `review_impacts` table, or derived on read from `review_relationships` plus `review_files`?  
   The roadmap prefers dedicated tables where queryability matters; implementation should choose the simplest shape that preserves queryability and bridge stability.
3. **AMBIGUITY:** Which languages are eligible for Phase 1.5 regex extraction versus Phase 2 tree-sitter extraction?  
   Current docs describe parser layering and TS/JS-first direction, but do not define the first supported language matrix.
4. **AMBIGUITY:** Should unchanged dependent files receive stable synthetic ids, or should bridge targets for unchanged files remain path-based until those files are materialized in review context?  
   `docs/MCP.md` exposes path-based impacts today; UI bridge ergonomics may require stronger identifiers later.
5. **AMBIGUITY:** Does a partially analyzed review need a dedicated user-visible lifecycle projection beyond `ready`, or is `workflow_state = 'ready'` plus explicit intelligence status sufficient?  
   Current lifecycle docs model workflow readiness, not intelligence completeness, so this spec keeps lifecycle and intelligence truth separate.

## Acceptance Criteria

- `docs/specs/impact-analysis-code-intelligence.md` exists.
- The document contains all 17 mandatory sections required by the assignment.
- The spec explicitly states that intelligence is review-scoped and names generic code exploration as a non-goal.
- The spec defines the `created -> analyzing -> ready` intelligence pipeline and the accounting rule for partial analyzer results.
- The spec defines a concrete impact minimap data structure and graph-diff bridging contract.
- The spec defines persistence direction for relationships, impacts, and analyzer-run records.
- The spec documents how the MCP `intelligence` namespace maps to persisted review artifacts and phase-unavailable behavior.
- The spec identifies current implementation gaps truthfully, including the absence of shipped intelligence services and tables in the current `src/` tree.
- The spec cross-references existing lifecycle, ingestion, MCP, architecture, and service-boundary specs without inventing a second intelligence model.
