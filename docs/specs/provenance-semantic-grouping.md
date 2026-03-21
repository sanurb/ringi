# SPEC-008: Provenance, Evidence, and Semantic Grouping

## Status
Draft

## Purpose
Define Ringi's canonical contracts for provenance, evidence, confidence scoring, and semantic grouping inside a review snapshot. This spec closes the gap between the architecture, which already treats provenance/evidence/grouping/confidence as first-class review intelligence, and the current implementation, which still exposes review files and comments without those structured artifacts.

The point is not decorative metadata. Per `docs/ARCHITECTURE.md`, provenance and evidence are the trust layer that makes a local-first AI review workbench materially different from a flat PR comment list.

## Scope
This spec covers:
- provenance for review-scoped artifacts
- evidence structure, taxonomy, storage, and attachment rules
- confidence score semantics for AI-generated findings
- semantic grouping and the grouped file tree contract
- how provenance/evidence/confidence attach to reviews, review files, comments, comment-owned suggestions, and todos
- persistence and query contracts required to serve the same grouped review truth to UI, CLI, HTTP, and MCP

## Non-Goals
This spec does not cover:
- full repository graph analysis outside the active review snapshot
- tree-sitter implementation details; `docs/ARCHITECTURE.md` explicitly allows regex first and tree-sitter later behind a stable contract
- UI pixel design, animation, or exact component layout for grouped navigation
- export markdown formatting beyond the requirement that exports read stored provenance/evidence rather than inventing it
- introducing a standalone `suggestions` table; SPEC-001 already decides that suggestions remain comment-owned
- repository-wide search, knowledge graph, or exploration surfaces outside review scope

## Canonical References
- `docs/ARCHITECTURE.md`
  - §2 Product Thesis
  - §3 Design Principles
  - §9 Domain Boundaries
  - §10 Component Architecture
  - §11 Data Flow
  - §12 Storage and Persistence Strategy
  - §16 Diff Processing Pipeline
  - §17 Code Intelligence Boundaries
  - §19 CLI / Server / Web UI / MCP Relationship
  - §20 Security and Local-First Guarantees
  - §24 Failure Modes
  - §25 Migration / Evolution Path
- `docs/MCP.md`
  - `reviews.create` input `provenance?` and `groupHints?`
  - `reviews.getFiles`
  - `intelligence.getRelationships`
  - `intelligence.getConfidence`
  - `Provenance`, `Relationship`, `Group`, and `ConfidenceScore` type sketches
- `docs/specs/review-lifecycle.md` (SPEC-001)
  - split lifecycle fields
  - review snapshot immutability
  - DD-3 suggestions remain comment-owned
  - lifecycle transition into `in_review` when new unresolved work appears
- `docs/specs/review-source-ingestion.md` (SPEC-002)
  - immutable snapshot anchoring
  - rename preservation via `file_path` + `old_path`
  - explicit degradation instead of silent truncation
- `docs/specs/persistence-data-model.md` (SPEC-005)
  - SQLite WAL contract
  - review/file/comment/todo canonical persistence model
  - explicit ambiguity that intelligence-table DDL still needs a dedicated spec
- `docs/specs/core-service-boundaries.md` (SPEC-006)
  - review vs intelligence vs source ownership boundaries
- `src/routes/api/-lib/services/review.service.ts`
- `src/routes/api/-lib/services/comment.service.ts`
- `src/api/schemas/review.ts`
- `src/api/schemas/comment.ts`

## Terminology
- **Provenance** — structured attribution describing who or what produced a review artifact, during which step, and for what stated reason. `docs/ARCHITECTURE.md` requires structured, machine-emittable provenance rather than narrative-only explanation.
- **Evidence** — inspectable supporting data for a relationship, comment, suggestion, confidence score, or grouped view. Per architecture, evidence is mandatory whenever the system asks the reviewer to trust derived intelligence.
- **Confidence score** — a numeric review-scoped trust signal attached to a derived machine finding. It prioritizes reviewer attention; it does not replace evidence.
- **Semantic grouping** — deterministic clustering of changed files by concern using directory heuristics, import/relationship evidence, rename continuity, and optional group hints.
- **Grouped file tree** — the persisted or reproducible tree representation consumed by UI, CLI, and MCP when listing review files by concern instead of as one flat alphabetical list.
- **Subject** — the review entity an intelligence artifact attaches to: `review`, `review_file`, `review_group`, `comment`, or `todo`.
- **Subject slot** — optional sub-target on a subject. This spec uses `subject_slot = 'suggestion'` to attach provenance/evidence/confidence to the suggestion embedded in a comment, consistent with SPEC-001 DD-3.
- **Override chain** — append-only provenance history showing that a later human or agent action superseded an earlier machine-generated artifact without erasing it.
- **Absent confidence** — no computed score is available. This is different from `0`.

## Requirements
1. **REQ-008-001 — Structured provenance is mandatory for derived intelligence**  
   Any machine-generated review artifact that influences ordering, grouping, highlighting, or suggested action SHALL carry at least one persisted provenance record.
2. **REQ-008-002 — Provenance actor identity**  
   Provenance SHALL record actor kind and identity using `human | agent | system`. Agent provenance SHALL include agent name and version when available. Tool identity SHALL be stored separately from actor identity.
3. **REQ-008-003 — Append-only provenance history**  
   Provenance SHALL be append-only. Later edits, overrides, or validations SHALL add a new provenance record linked to the prior record instead of mutating old provenance in place.
4. **REQ-008-004 — Review-scoped attachment model**  
   Provenance SHALL be attachable to `review`, `review_file`, `review_group`, `comment`, and `todo`. Comment-owned suggestions SHALL use `subject_type = 'comment'` with `subject_slot = 'suggestion'`.
5. **REQ-008-005 — Evidence or it does not count**  
   Any relationship edge, grouped-file explanation, or confidence score exposed to reviewers SHALL reference persisted evidence records. The system SHALL NOT emit a confidence score without evidence references.
6. **REQ-008-006 — Typed evidence taxonomy**  
   Evidence SHALL be stored with a queryable `kind` discriminator rather than only opaque text blobs.
7. **REQ-008-007 — Evidence payload versioning**  
   Evidence and provenance payloads SHALL carry a schema version so parser upgrades can preserve readability of older reviews.
8. **REQ-008-008 — Confidence score range**  
   Confidence SHALL be stored as a real number in the closed interval `[0, 1]`.
9. **REQ-008-009 — Absent confidence semantics**  
   Missing confidence SHALL be represented as `NULL` / absent, not `0`. A score of `0` means the system explicitly computed near-zero confidence.
10. **REQ-008-010 — Confidence threshold semantics**  
    A score below `0.60` SHALL be treated as attention-seeking risk in ordering and highlighting because the MCP guide already uses `< 0.6` as the risky-file threshold.
11. **REQ-008-011 — Deterministic grouped tree**  
    The grouped file tree SHALL be deterministic for a given review snapshot and persisted intelligence set. Re-fetching the same review SHALL NOT reshuffle groups unless the underlying review snapshot or persisted intelligence changed.
12. **REQ-008-012 — Grouping inputs**  
    Semantic grouping SHALL use, in priority order: rename continuity from snapshot anchors, persisted relationship evidence, directory heuristics, and optional review-level `groupHints`.
13. **REQ-008-013 — No silent file dropping**  
    Grouping SHALL include every persisted `review_file`, including renamed, binary, truncated, or unsupported files. Unsupported files MAY fall back to an explicit catch-all group but SHALL NOT disappear.
14. **REQ-008-014 — Cross-surface truth**  
    UI, CLI, HTTP, and MCP SHALL read the same persisted provenance/evidence/group/confidence truth through shared services. No adapter SHALL invent a parallel representation.
15. **REQ-008-015 — Multiple-agent disambiguation**  
    When multiple agents contribute to one review, persisted provenance SHALL distinguish them by actor identity and version so their findings are not collapsed into one anonymous source.
16. **REQ-008-016 — Human override preservation**  
    When a human edits, rejects, or supersedes an AI-generated comment, suggestion, todo, or group assignment, the override SHALL be represented as a new provenance record linked to the prior machine provenance.
17. **REQ-008-017 — External link evidence**  
    Evidence MAY reference external URLs such as CI logs, but those URLs SHALL be treated as untrusted text and SHALL NOT create executable HTML rendering paths.
18. **REQ-008-018 — Current-gap truthfulness**  
    Until this spec is implemented, services SHALL surface missing provenance/evidence/confidence/group data as absent values. They SHALL NOT synthesize fake defaults to look complete.
19. **REQ-008-019 — Queryable file-level summary**  
    `review_files` SHALL expose a stable group reference and a derived confidence summary so file listing surfaces can order and filter without re-running deep intelligence every time.
20. **REQ-008-020 — Review creation hints are advisory**  
    `reviews.create(..., { provenance, groupHints })` MAY seed analysis, but persisted grouping and confidence SHALL still be derived from the anchored review snapshot plus stored intelligence, not from unverified hints alone.

## Workflow / State Model
### Intelligence attachment lifecycle
```text
review created
  -> workflow_state = created
  -> workflow_state = analyzing
  -> intelligence service reads anchored review snapshot
  -> persist provenance records
  -> persist evidence records
  -> compute semantic groups
  -> compute confidence for files/groups/findings
  -> workflow_state = ready
  -> first comment/todo/manual start moves review to in_review per SPEC-001
```

### Attachment rules by subject
| Subject | When attached | Producer | Required artifacts |
| --- | --- | --- | --- |
| `review` | creation and analysis passes | human / agent / system | provenance; optional seed evidence |
| `review_file` | after diff parse and intelligence analysis | system / agent | provenance, optional evidence, optional confidence, `group_id` |
| `review_group` | after grouping pass | system / agent | provenance explaining grouping, member evidence, optional confidence |
| `comment` | creation/update/resolution | human / agent / system | provenance for authoring action; evidence optional unless machine-generated claim |
| `comment` + `subject_slot = suggestion` | suggestion create/update | human / agent / system | provenance for suggestion origin; evidence required for machine suggestion rationale |
| `todo` | create/update/complete/reopen | human / agent / system | provenance for actor and reason; evidence optional unless machine-generated |

### Override chain model
1. Machine creates a comment or suggestion with provenance and evidence.
2. Human edits, rejects, or rewrites it.
3. The human action appends a new provenance row with `relation = 'overrides'` to the prior provenance row.
4. The current visible artifact points to the latest provenance row, but the full chain remains queryable for audit.

### Current implementation gaps this spec closes
Verified from source:
- `src/api/schemas/review.ts` exposes only `status`, `sourceType`, `sourceRef`, and opaque `snapshotData`; there is no provenance/evidence/confidence/group surface.
- `ReviewService.getById()` returns files with `id`, `filePath`, `oldPath`, `status`, `additions`, and `deletions` only.
- `docs/MCP.md` already sketches `ReviewFile.provenance`, `ReviewFile.confidence`, and `ReviewFile.groupId`, but `src/routes/api/-lib/services/review.service.ts` does not currently populate them.
- `src/api/schemas/comment.ts` and `CommentService.create()/update()` only handle comment content and embedded suggestion text; they do not accept or persist provenance/evidence.

## API / CLI / MCP Implications
### Shared core API implications
- Review reads SHALL grow from plain diff metadata to include grouped tree membership, provenance summaries, and confidence summaries.
- Comment and todo mutation APIs SHALL gain additive provenance-aware variants or internally attach provenance based on authenticated actor context. The service layer owns that attachment; adapters only provide actor context.
- Suggestion provenance SHALL remain attached through the owning comment contract rather than introducing a second suggestion representation.

### MCP implications
- `docs/MCP.md` already defines `reviews.create(..., { provenance?, groupHints? })`; this spec makes those inputs canonical review-level seeds rather than example-only fields.
- `reviews.getFiles(reviewId)` SHALL return each file's stable `groupId`, provenance summary, and confidence summary from persisted storage.
- `intelligence.getRelationships(reviewId)` SHALL return relationship edges plus evidence references grounded in persisted evidence.
- `intelligence.getConfidence(reviewId)` SHALL return scored subjects with reasons that are traceable to stored provenance/evidence.
- MCP callers SHALL interpret `confidence = null` as “not computed” and `confidence = 0` as “computed but untrusted”.

### CLI implications
- Read-only CLI surfaces that summarize review files SHALL use the grouped file tree once available instead of flattening files alphabetically.
- CLI JSON output for review inspection SHOULD expose group ids/labels, confidence, and provenance summary without requiring a running server, consistent with SPEC-003 and SPEC-005 local-first reads.
- CLI diagnostics SHOULD surface partial or missing intelligence explicitly rather than pretending the review is fully analyzed.

### HTTP / UI implications
- HTTP/UI file lists SHALL consume the same grouped file tree contract as MCP and CLI.
- Confidence-based ordering/highlighting SHALL be advisory only; UI SHALL always provide evidence access for machine findings.
- Provenance/evidence text SHALL be rendered as escaped text only, consistent with `docs/ARCHITECTURE.md` §20.

## Data Model Impact
SPEC-005 explicitly left intelligence-table DDL open. This spec defines it.

### 1. Subject attachment shape
Every provenance, evidence link, and confidence row SHALL use the same attachment coordinates:

```ts
subjectType:
  | 'review'
  | 'review_file'
  | 'review_group'
  | 'comment'
  | 'todo'

subjectSlot:
  | null
  | 'suggestion'
```

Constraint rules:
- `subject_slot = 'suggestion'` is only valid when `subject_type = 'comment'`.
- Suggestions remain comment-owned per SPEC-001 DD-3.

### 2. Proposed intelligence tables
```sql
CREATE TABLE review_groups (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('concern', 'directory', 'rename_chain', 'ungrouped')),
  sort_order INTEGER NOT NULL,
  heuristic TEXT NOT NULL CHECK (heuristic IN ('rename', 'relationship', 'directory', 'hint', 'fallback')),
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(review_id, key)
) STRICT;

CREATE TABLE review_group_members (
  group_id TEXT NOT NULL REFERENCES review_groups(id) ON DELETE CASCADE,
  review_file_id TEXT NOT NULL REFERENCES review_files(id) ON DELETE CASCADE,
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  membership_reason TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 1 CHECK (is_primary IN (0, 1)),
  PRIMARY KEY (group_id, review_file_id)
) STRICT;

CREATE TABLE review_provenance (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('review', 'review_file', 'review_group', 'comment', 'todo')),
  subject_id TEXT NOT NULL,
  subject_slot TEXT CHECK (subject_slot IN ('suggestion')),
  relation TEXT NOT NULL CHECK (relation IN ('created', 'generated', 'updated', 'validated', 'overrides', 'imported')),
  parent_provenance_id TEXT REFERENCES review_provenance(id) ON DELETE SET NULL,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('human', 'agent', 'system')),
  actor_name TEXT NOT NULL,
  actor_version TEXT,
  tool_name TEXT,
  tool_version TEXT,
  step TEXT NOT NULL,
  reason TEXT NOT NULL,
  metadata_json TEXT,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

CREATE TABLE review_evidence (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'diff_excerpt',
    'relationship_excerpt',
    'test_result',
    'lint_result',
    'type_error',
    'command_output',
    'external_link',
    'provenance_note'
  )),
  title TEXT NOT NULL,
  summary TEXT,
  source_uri TEXT,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

CREATE TABLE review_evidence_links (
  id TEXT PRIMARY KEY,
  evidence_id TEXT NOT NULL REFERENCES review_evidence(id) ON DELETE CASCADE,
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('review', 'review_file', 'review_group', 'comment', 'todo')),
  subject_id TEXT NOT NULL,
  subject_slot TEXT CHECK (subject_slot IN ('suggestion')),
  provenance_id TEXT REFERENCES review_provenance(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('supports', 'explains', 'contradicts', 'seed'))
 ) STRICT;

CREATE TABLE review_confidence (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('review_file', 'review_group', 'comment', 'todo')),
  subject_id TEXT NOT NULL,
  subject_slot TEXT CHECK (subject_slot IN ('suggestion')),
  score REAL NOT NULL CHECK (score >= 0 AND score <= 1),
  band TEXT NOT NULL CHECK (band IN ('low', 'guarded', 'medium', 'high')),
  reasons_json TEXT NOT NULL,
  derived_from_count INTEGER NOT NULL DEFAULT 0,
  computed_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;
```

### 3. Required additions to existing tables
```sql
ALTER TABLE review_files ADD COLUMN group_id TEXT REFERENCES review_groups(id) ON DELETE SET NULL;
ALTER TABLE review_files ADD COLUMN confidence_score REAL CHECK (confidence_score >= 0 AND confidence_score <= 1);
ALTER TABLE review_files ADD COLUMN primary_provenance_id TEXT REFERENCES review_provenance(id) ON DELETE SET NULL;
```

Rationale from `docs/ARCHITECTURE.md` §12:
- `review_files` must grow to include structured provenance, derived confidence, and a stable group reference.
- `review_groups` and review-scoped relationship/evidence artifacts should be queryable tables, not one opaque JSON blob.

### 4. Evidence payload shapes
The `payload_json` field is versioned, but the minimum expected shapes are:

```ts
type DiffExcerptEvidence = {
  path: string;
  oldPath?: string | null;
  hunkHeader?: string | null;
  line?: number | null;
  excerpt: string;
};

type RelationshipExcerptEvidence = {
  sourceFile: string;
  targetFile: string;
  kind: 'imports' | 'calls' | 're_exports' | 'renames' | 'configuration' | 'test_coverage';
  path: string;
  line: number;
  excerpt: string;
};

type TestResultEvidence = {
  command: string;
  exitCode: number | null;
  status: 'passed' | 'failed' | 'timed_out' | 'inconclusive';
  outputExcerpt?: string | null;
  sourceUrl?: string | null;
};

type LintResultEvidence = {
  tool: string;
  ruleId?: string | null;
  severity: 'info' | 'warning' | 'error';
  path: string;
  line?: number | null;
  message: string;
};

type TypeErrorEvidence = {
  tool: string;
  path: string;
  line?: number | null;
  code?: string | null;
  message: string;
};

type ExternalLinkEvidence = {
  url: string;
  label: string;
  kind: 'ci' | 'issue' | 'doc' | 'other';
};
```

### 5. Confidence bands
This spec standardizes file/group attention semantics:

| Score range | Band | Meaning | Ordering implication |
| --- | --- | --- | --- |
| `0.00` to `< 0.40` | `low` | machine finding is weakly supported | surface early and highlight risk |
| `0.40` to `< 0.60` | `guarded` | partial support, still risky | surface early |
| `0.60` to `< 0.80` | `medium` | usable but reviewer should inspect evidence | normal order within group |
| `0.80` to `1.00` | `high` | strongly supported by current evidence | de-emphasize relative to lower scores |

`NULL` means not computed or not applicable.

### 6. Grouped file tree algorithm
For one anchored review snapshot, the grouping pass SHALL run as follows:

1. Start from all persisted `review_files` rows for the review. No file is optional.
2. Collapse rename continuity first using `old_path`/`file_path` from SPEC-002 and any persisted `renames` relationship evidence. A rename chain forms one logical candidate cluster.
3. Apply relationship-based clustering next using persisted review-scoped relationships (`imports`, `calls`, `re_exports`, `configuration`, `test_coverage`). Only relationships with linked evidence may influence grouping.
4. Apply directory heuristics to any remaining ungrouped files. The heuristic groups by the closest shared stable directory boundary that explains more than one changed file.
5. Apply `groupHints` only as labels or tie-breakers for already-supported clusters; hints alone SHALL NOT create unsupported membership.
6. Create explicit fallback groups for files still unassigned. The fallback kind is `ungrouped`, not omission.
7. Sort groups deterministically by: lowest member confidence first, then largest file count, then label ascending.
8. Sort files inside a group deterministically by: lowest confidence first, then rename-chain root, then path ascending.

This algorithm is grounded in `docs/ARCHITECTURE.md` §17, which defines grouped file tree structure from directory and import heuristics, and in `docs/MCP.md`, which already exposes review groups as a first-class contract.

### 7. Query patterns the schema must support
- list groups for a review in stable order
- list files in one group with summary confidence and primary provenance
- load full provenance chain for a comment or suggestion
- load all evidence referenced by one confidence record
- filter review files by `confidence_score < 0.60`
- distinguish findings from two different agents by actor name/version

## Service Boundaries
- **Intelligence service owns** provenance extraction, evidence extraction, semantic grouping, confidence derivation, and persistence of those intelligence artifacts. This follows `docs/ARCHITECTURE.md` §9 and §10.
- **ReviewService owns** orchestration around review creation/loading, review snapshot identity, and exposing grouped/intelligence-enriched review reads. It may seed review-level provenance and `groupHints`, but it SHALL NOT embed grouping heuristics or confidence formulas inline.
- **CommentService owns** comment lifecycle and suggestion lifecycle, but it SHALL append provenance records whenever comments or embedded suggestions are created, edited, resolved, or overridden.
- **TodoService owns** todo lifecycle and SHALL append provenance for machine-created or human-updated todos.
- **ExportService owns** serialization only. It SHALL read stored provenance/evidence/confidence/group data; it SHALL NOT recompute intelligence during export.
- **Source/Git services own** repository inspection and diff acquisition only. They SHALL NOT assign group ids or confidence scores; `docs/ARCHITECTURE.md` explicitly keeps source separate from confidence scoring.
- **Adapters own** actor-context normalization only:
  - CLI provides human/agent invocation context.
  - HTTP provides authenticated actor context.
  - MCP provides agent identity/version and optional review creation hints.

## Edge Cases
- **Multiple agents in one review** — persist separate provenance records with distinct `actor_name` and `actor_version`; never collapse them into one anonymous `agent` source.
- **Human overriding AI suggestion** — append a new provenance row with `relation = 'overrides'` on the comment suggestion slot. Do not mutate or delete the original AI provenance.
- **Confidence `0` vs absent** — `0` means computed and nearly unsupported; absent means not computed. Ordering and UI copy MUST distinguish them.
- **Evidence with external URLs** — store as `external_link` evidence or `source_uri` on a structured evidence row. Render as escaped text/link metadata only.
- **Rename chains** — grouping must use `review_files.old_path` plus relationship kind `renames` when available so renamed files stay in one logical cluster instead of appearing as unrelated add/delete entries.
- **Binary or truncated files** — keep them in the grouped tree with explicit degraded state inherited from SPEC-002; confidence MAY be absent if no valid evidence exists.
- **Analysis timeout** — per `docs/ARCHITECTURE.md` §24, intelligence may be partial. Persist partial provenance/evidence/confidence only when explicitly marked partial; do not fabricate completion.
- **Conflicting evidence** — if one evidence row supports and another contradicts the same finding, keep both linked and downgrade confidence instead of deleting the contradiction.
- **Stale group hints** — `groupHints` are advisory seeds only. They MUST NOT force an unsupported group when persisted evidence and directory heuristics contradict the hint.

## Observability
The implementation SHALL emit structured logs and metrics for:
- provenance rows created per review by subject type and actor kind
- evidence rows created per review by `kind`
- grouped-file-tree build duration and resulting group count
- number of files in fallback `ungrouped` buckets
- confidence distribution buckets (`low`, `guarded`, `medium`, `high`, `absent`)
- multiple-agent contribution count per review
- override-chain events (`relation = 'overrides'`)
- partial-analysis conditions such as timeout, parser fallback, or unsupported evidence

Diagnostics SHOULD expose:
- reviews with missing intelligence artifacts despite `workflow_state = 'ready'`
- evidence rows whose payload version is no longer the current writer version
- grouped-tree builds that produced only fallback groups
- confidence records with zero linked evidence, which would violate this spec

## Rollout Considerations
1. Apply SPEC-005 persistence changes first so the intelligence tables can be added under the same SQLite WAL contract.
2. Add the new tables and `review_files` columns in additive migrations before changing service reads.
3. Update intelligence generation to persist provenance/evidence/group/confidence after review snapshot creation and before `ready` is considered complete.
4. Update `ReviewService` reads to hydrate grouped files, provenance summary, and confidence summary from persisted data.
5. Update comment/todo write paths to append provenance for human and agent actions.
6. Keep legacy reviews readable with absent intelligence values; do not backfill fake provenance for historic rows.
7. Only after read paths are stable should ordering/highlighting rely on confidence thresholds.

## Open Questions
1. **AMBIGUITY:** `docs/ARCHITECTURE.md` allows `review_groups` only when ordering must persist rather than be recomputed deterministically. This spec chooses persisted groups for cross-surface consistency, but the project still needs to decide whether purely deterministic recomputation is acceptable for early phases.
2. **AMBIGUITY:** `docs/MCP.md` sketches a single `Provenance` shape at file level, while this spec generalizes provenance to all subject types. The exact transport shape for comment/todo provenance in HTTP and CLI JSON is not yet defined elsewhere.
3. **AMBIGUITY:** No current source defines the exact confidence formula weights. This spec fixes the score range and display thresholds, but the numeric derivation from provenance quality, evidence quality, and mechanical-change signals still needs a dedicated algorithm note.
4. **AMBIGUITY:** `groupHints` exist in MCP create input as `string[]` only. There is no current contract for hint-to-file mapping or hint priority. This spec treats them as review-level advisory labels only.
5. **AMBIGUITY:** `external_link` evidence can point to CI or docs, but current local-first docs do not define caching or offline semantics for those external references.

## Acceptance Criteria
- `docs/specs/provenance-semantic-grouping.md` exists and uses the mandatory 17-section spec structure.
- The spec defines a canonical provenance model that attaches to reviews, files, comments, comment-owned suggestions, and todos.
- The spec defines a typed evidence taxonomy that includes at least test results, lint results, type errors, diff/relationship excerpts, and external links.
- The spec defines confidence as a numeric range `[0, 1]`, explicitly distinguishes `0` from absent confidence, and documents the `< 0.60` risk threshold.
- The spec defines a deterministic grouped file tree model and a grouping algorithm grounded in rename continuity, relationship evidence, directory heuristics, and `groupHints`.
- The spec defines concrete SQLite intelligence tables and the `review_files` additions needed to store and query provenance/evidence/group/confidence.
- The spec states current verified implementation gaps using `src/routes/api/-lib/services/review.service.ts`, `src/routes/api/-lib/services/comment.service.ts`, `src/api/schemas/review.ts`, and `src/api/schemas/comment.ts`.
- The spec cross-references SPEC-001, SPEC-002, SPEC-005, `docs/ARCHITECTURE.md`, and `docs/MCP.md` without inventing architecture outside those anchors.
