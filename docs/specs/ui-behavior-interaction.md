# SPEC-010: UI Behavior and Interaction

## 1. Status

Draft

## 2. Purpose

Define the canonical web UI behavior for Ringi's TanStack Router presentation layer: route structure, review-detail workspace layout, lifecycle-driven affordances, diff and annotation interactions, todo integration, and realtime update behavior.

This spec translates the review-centric architecture in `docs/ARCHITECTURE.md` into observable UI behavior without inventing new product surfaces. It also records current implementation gaps where the shipped UI does not yet satisfy the architecture or other written specs.

## 3. Scope

This spec covers:

- browser routes under `src/routes/`
- page-level behavior for staged changes, reviews list, review creation, and review detail
- review detail layout: file tree, diff viewer, annotations panel, action bar, todo panel
- lifecycle-driven UI states derived from the review lifecycle model
- inline comments, suggestions, and comment resolution behavior inside the diff
- grouped file tree behavior as the primary review navigation surface
- SSE-driven refresh behavior for local server-connected UI sessions
- keyboard shortcut behavior that is currently implemented or directly implied by shipped hooks/components

## 4. Non-Goals

This spec does not define:

- CLI command behavior beyond UI implications already covered by `docs/specs/cli-surface-contracts.md`
- MCP interaction semantics beyond UI read/write implications already covered by `docs/specs/mcp-execute-api.md`
- persistence schema details beyond UI-visible consequences already covered by `docs/specs/persistence-data-model.md`
- intelligence extraction algorithms, provenance generation, or graph construction internals
- remote multi-user collaboration, cloud tenancy, or browser access outside localhost/local server operation
- a mobile-first responsive redesign not evidenced in the current implementation

## 5. Canonical References

- `docs/ARCHITECTURE.md` §8, §10, §11, §13, §14, §16, §17
- `docs/specs/review-lifecycle.md` (SPEC-001)
- `docs/specs/review-source-ingestion.md` (SPEC-002)
- `docs/specs/core-service-boundaries.md` (SPEC-006)
- `src/routes/__root.tsx`
- `src/routes/index.tsx`
- `src/routes/reviews.tsx`
- `src/routes/reviews/index.tsx`
- `src/routes/reviews/new.tsx`
- `src/routes/reviews/$reviewId.tsx`
- `src/routes/-shared/layout/file-tree.tsx`
- `src/routes/-shared/layout/annotations-panel.tsx`
- `src/routes/-shared/layout/action-bar.tsx`
- `src/routes/-shared/diff/diff-view.tsx`
- `src/routes/-shared/diff/diff-file.tsx`
- `src/routes/-shared/diff/inline-comment-composer.tsx`
- `src/routes/-shared/diff/inline-comment-thread.tsx`
- `src/routes/-shared/todos/todo-panel.tsx`
- `src/routes/-shared/hooks/use-keyboard-shortcuts.ts`
- `src/routes/-shared/hooks/use-event-source.ts`
- `src/routes/api/$.ts`
- `src/routes/api/-lib/services/event.service.ts`
- `src/routes/api/-lib/services/review.service.ts`

**AMBIGUITY:** `docs/specs/events-realtime.md` and `docs/specs/provenance-semantic-grouping.md` were not present at the time of writing. Eventing and grouping requirements in this spec therefore trace to `docs/ARCHITECTURE.md` plus the current implementation under `src/routes/` and `src/routes/api/-lib/services/`.

## 6. Terminology

- **Changes page** — the `/` route showing the current staged diff before review creation.
- **Reviews list** — the `/reviews` index route listing persisted review sessions.
- **Review detail** — the `/reviews/$reviewId` route that hosts the review workbench.
- **Action bar** — the fixed top bar controlling status actions, diff mode, annotation visibility, export, and context badges.
- **File tree** — the left navigation rail used to select a changed file inside the current review snapshot.
- **Grouped file tree** — the architecture target where the file tree is organized by persisted review-scoped grouping artifacts rather than raw path hierarchy alone.
- **Diff viewer** — the center pane rendering per-file patches and inline comment anchors.
- **Annotations panel** — the right rail showing comments and suggestions attached to the review.
- **Todo panel** — the global slide-over todo surface mounted from the root route.
- **Lifecycle state** — the derived review lifecycle from SPEC-001: `created`, `analyzing`, `ready`, `in_review`, `approved`, `changes_requested`, `exported`.
- **Legacy status** — the currently persisted single-field review status exposed in the shipped UI: `in_progress`, `approved`, `changes_requested`.
- **Server-confirmed update** — a UI state change applied only after the HTTP mutation succeeds.

## 7. Requirements

### 7.1 Route structure and entrypoints

- **REQ-010-001** The web UI SHALL use TanStack Router file routes rooted at `src/routes/`, consistent with `docs/ARCHITECTURE.md` §8 and the current route tree.
- **REQ-010-002** The canonical browser routes SHALL be:
  - `/` — staged changes workspace
  - `/reviews` — route parent for review routes
  - `/reviews/` — reviews list
  - `/reviews/new` — review creation page
  - `/reviews/$reviewId` — review detail workspace
- **REQ-010-003** The UI SHALL be local-first: all routes SHALL assume the server is running on localhost and SHALL NOT imply a hosted/cloud control plane.
- **REQ-010-004** Review creation in the current web UI SHALL expose only staged-source creation, because `src/routes/reviews/new.tsx` posts `sourceType: "staged"` with `sourceRef: null`.
- **REQ-010-005** The route table SHALL distinguish current behavior from backend capability when the backend supports branch/commits review sources that the UI does not yet expose.

### 7.2 Review-detail layout

- **REQ-010-006** The review detail route SHALL present a three-pane workspace composed of file tree, diff viewer, and annotations panel, with an action bar above them, matching `src/routes/reviews/$reviewId.tsx`.
- **REQ-010-007** The file tree SHALL remain the primary in-review navigation surface for selecting a file and scrolling the diff viewer to that file.
- **REQ-010-008** The diff viewer SHALL render review files in snapshot order returned by the server and SHALL support split and unified modes.
- **REQ-010-009** The annotations panel SHALL remain review-scoped and SHALL display comments/suggestions tied to the current review snapshot.
- **REQ-010-010** The todo panel SHALL be globally mounted from the root layout and SHALL be reachable from any page via keyboard shortcut.

### 7.3 Lifecycle-driven behavior

- **REQ-010-011** Lifecycle-driven UI behavior SHALL be derived from SPEC-001 rather than from ad hoc page-local booleans.
- **REQ-010-012** The UI SHALL show a non-interactive loading/analysis state when a review is opened during `created` or `analyzing`.
- **REQ-010-013** The UI SHALL allow annotation work only after the review reaches `ready` or `in_review`.
- **REQ-010-014** The UI SHALL represent `approved`, `changes_requested`, and `exported` as distinct UI states, not as variants of a generic in-progress badge.
- **REQ-010-015** Exported reviews SHALL render as read-only snapshots: comment creation, status mutation, and todo mutation from review context SHALL be disabled.
- **REQ-010-016** The UI SHALL use server-confirmed lifecycle transitions; the visible lifecycle badge or action affordance SHALL NOT claim success before the corresponding mutation succeeds.

### 7.4 File tree and grouping

- **REQ-010-017** The file tree SHALL support hierarchical navigation of changed files within a review snapshot.
- **REQ-010-018** Directory nodes SHALL be collapsible/expandable and file nodes SHALL be selectable.
- **REQ-010-019** The file tree SHALL expose per-file status and line-count metadata sufficient to prioritize review attention.
- **REQ-010-020** Keyboard navigation in the file tree SHALL support `j`/`k` and Up/Down Arrow to move selection when focus is not inside form fields.
- **REQ-010-021** The long-term canonical navigation model SHALL be a grouped file tree informed by review-scoped grouping/provenance artifacts described in `docs/ARCHITECTURE.md` §17.
- **REQ-010-022** Until grouped review artifacts exist in the UI API, the file tree MAY fall back to raw path hierarchy, but this fallback SHALL be documented as an implementation gap rather than described as the target architecture.

### 7.5 Diff viewer and inline annotations

- **REQ-010-023** The diff viewer SHALL lazy-load file hunks for persisted review detail routes when the review API does not preload hunks.
- **REQ-010-024** The diff viewer SHALL render inline comment anchors per line and SHALL support opening an inline composer directly from the diff gutter.
- **REQ-010-025** Inline comments SHALL capture `filePath`, `lineNumber`, and `lineType` so they remain anchored to the persisted review snapshot.
- **REQ-010-026** Suggestions SHALL remain comment-owned artifacts rather than a separate UI entity, consistent with current comment modeling.
- **REQ-010-027** Comment resolution and deletion actions SHALL be available from inline comment threads rendered inside the diff.
- **REQ-010-028** Files without hunks SHALL render an explicit non-code state such as binary file/mode change rather than an empty diff body.
- **REQ-010-029** Very long files and very large reviews SHALL avoid eager full expansion of all diffs; the UI SHALL default to collapsed or lazily loaded sections for scale.

### 7.6 Annotation panel and review context

- **REQ-010-030** The annotations panel SHALL support review-wide comment browsing grouped by file.
- **REQ-010-031** The annotations panel SHALL surface comment resolution state and suggestion presence where applicable.
- **REQ-010-032** The annotations panel SHALL respond to current review context, including selected file filtering or highlighting when `selectedFile` is provided.
- **REQ-010-033** The annotations panel SHALL preserve parity with inline thread actions for resolve/unresolve/delete where those actions are available elsewhere in the UI.

### 7.7 Todos and realtime behavior

- **REQ-010-034** The todo panel SHALL support create, toggle, delete, and clear-completed operations.
- **REQ-010-035** Review-scoped todos SHALL be visually distinguishable from global todos when a review context exists.
- **REQ-010-036** UI routes that subscribe to SSE SHALL refresh affected slices in response to typed events from `/api/events`, not force a full browser reload.
- **REQ-010-037** Realtime event handling SHALL remain scoped: review detail SHOULD refresh only the affected review/comments/files/todos state that changed.
- **REQ-010-038** SSE reconnection behavior SHALL tolerate transient disconnects without requiring manual refresh.

### 7.8 Accessibility and responsive behavior

- **REQ-010-039** Keyboard shortcuts SHALL be disabled while focus is inside `input`, `textarea`, or `select` elements.
- **REQ-010-040** Dismissible panels opened by keyboard or pointer SHALL provide Escape-based close behavior.
- **REQ-010-041** Responsive behavior SHALL preserve access to the core review surfaces on smaller widths; when all three panes cannot remain visible, the UI SHALL degrade by collapsing secondary panels before it compromises diff readability.
- **REQ-010-042** Any responsive fallback not yet implemented SHALL be recorded as a gap, not implied as already shipped.

## 8. Workflow / State Model

### 8.1 Route table

| Route | Current component | What it shows now | Target canonical role | Lifecycle relevance |
| --- | --- | --- | --- | --- |
| `/` | `src/routes/index.tsx` | Current staged diff, file tree, diff mode toggle, SSE invalidation, shortcuts for new review/reviews list | Pre-review staging workspace for local-first review creation | Not tied to persisted review lifecycle; it precedes review creation |
| `/reviews/` | `src/routes/reviews/index.tsx` | Review list with status/source badges and navigation to new/detail pages | Persisted review session index | Must show derived lifecycle state, not legacy status only |
| `/reviews/new` | `src/routes/reviews/new.tsx` | Repository metadata, staged summary, create button | Review creation entrypoint | Enters review at `created` then `analyzing`; current UI immediately navigates to detail after create response |
| `/reviews/$reviewId` | `src/routes/reviews/$reviewId.tsx` | Action bar, file tree, diff viewer, annotations panel | Primary review workbench | Must express `created → analyzing → ready → in_review → approved|changes_requested → exported` |

### 8.2 Lifecycle-to-UI mapping

| Lifecycle state (SPEC-001) | Expected UI treatment | Current implementation evidence | Current gap |
| --- | --- | --- | --- |
| `created` | Skeleton/placeholder review shell; actions disabled except navigation | Not represented; review detail loads immediately from `loadReview()` | Legacy status model collapses this into `in_progress` |
| `analyzing` | Analysis-in-progress state with read-only or partial content | Not represented | No page-level analysis state or SSE-driven transition handling |
| `ready` | Diff visible, reviewer can begin annotation, no final verdict yet | Approximated by current review detail with status badge | Badge/action model uses legacy `status` only |
| `in_review` | Same workspace as `ready`, but annotations/todos now exist or explicit review start recorded | Not represented separately | No distinction between ready vs active review |
| `approved` | Verdict badge, approve action disabled, export available | `ActionBar` disables Approve when `status === "approved"` | Based on legacy single status; not derived from SPEC-001 split fields |
| `changes_requested` | Verdict badge, request-changes visible, export policy depends on lifecycle rules | Implemented as a status action | Not reconciled with workflow/review-decision split |
| `exported` | Read-only snapshot view with export fact visible | Not represented | No exported read-only UI state |

### 8.3 Review-detail interaction model

1. The route loader fetches review metadata, file metadata, summary, comments, and comment stats.
2. The page initializes local UI state for selected file, diff mode, and annotation panel visibility.
3. Selecting a file in the file tree updates `selectedFile` and scrolls the center pane to that file container.
4. Expanding a diff file lazy-loads hunks through `http.reviewFiles.hunks` when `reviewId` is present and hunks were not preloaded.
5. Clicking the diff gutter plus button opens an inline composer anchored to a specific line and side.
6. Posting a comment invalidates the router so loader-backed review data refreshes.
7. The annotations panel presents grouped comment cards as a secondary navigation surface.
8. Status actions and export are initiated from the action bar.

### 8.4 Realtime state model

- The staged changes page subscribes to `/api/events` through `useEventSource()` and currently invalidates the router on every event.
- The SSE service emits typed events: `todos`, `reviews`, `comments`, `files`.
- The event hook reconnects after a one-second delay on failure.
- **AMBIGUITY:** `docs/ARCHITECTURE.md` §13 also names an `intelligence` event type, but the current `EventService` and `useEventSource` type unions do not include it.

## 9. API / CLI / MCP Implications

### 9.1 UI-to-API implications

- The UI route model depends on HTTP server access for review creation, review detail loading, comment mutation, todo mutation, export, and SSE.
- Review detail currently calls a generic review update endpoint with a legacy `status` payload. This is incompatible with SPEC-001's explicit lifecycle operations and must be replaced once the lifecycle cutover lands.
- Lazy diff expansion depends on `reviewFiles.hunks(reviewId, filePath)` returning persisted hunks for the immutable snapshot.
- Inline comments depend on comment create/resolve/unresolve/delete endpoints preserving review/file/line anchors.
- Export in the action bar currently calls the markdown export endpoint and downloads the returned blob.

### 9.2 Cross-surface implications

- The browser UI SHALL remain a thin presentation layer over core services, consistent with `docs/specs/core-service-boundaries.md`.
- UI lifecycle badges and affordances MUST align with CLI and MCP lifecycle semantics once SPEC-001 is implemented; no browser-only lifecycle vocabulary is allowed.
- The UI MUST NOT expose review-source capabilities that the backend cannot create, and MUST NOT hide backend-supported capabilities without documenting the gap.

### 9.3 Current implementation gaps affecting surface contracts

- `src/routes/reviews/new.tsx` exposes only staged review creation even though ReviewService supports `staged | branch | commits`.
- `src/routes/reviews/$reviewId.tsx` mutates legacy `status` rather than explicit lifecycle transitions.
- `src/routes/reviews/$reviewId.tsx` does not subscribe to SSE, so review detail does not live-refresh comments/files/status/todos.
- `ActionBar.handleCopyDiff()` calls the export markdown endpoint and copies markdown, not a raw diff. The label "Copy Diff" is inaccurate.

## 10. Data Model Impact

This spec does not introduce new tables by itself, but it has direct data-model implications:

- Review list and review detail UIs need the derived lifecycle state from SPEC-001, not only the legacy `status` field.
- Review detail needs immutable hunks per file for all review sources; current branch/commits behavior in `ReviewService.getFileHunks()` re-diffs live git state and violates snapshot truth.
- Grouped file tree behavior eventually requires review-scoped grouping/provenance artifacts addressable by the UI.
- Exported read-only UI needs `exported_at` or equivalent export fact to be queryable.
- Review-scoped todo presentation depends on `todo.reviewId`, which already exists in `src/api/schemas/todo.ts`.

## 11. Service Boundaries

- **Presentation layer owns** layout composition, selection state, panel visibility, diff mode, shortcut registration, and rendering of persisted review artifacts.
- **ReviewService owns** review creation, review retrieval, lifecycle transitions, and file-hunk retrieval semantics.
- **CommentService owns** comment creation, update, resolve/unresolve, deletion, and review/file-scoped retrieval.
- **TodoService owns** todo CRUD, ordering, review linkage, and stats.
- **EventService owns** event publication/subscription and watcher-driven file events.
- **ExportService owns** export artifact generation; the UI only triggers export and displays/downloads the result.
- The UI SHALL NOT derive lifecycle truth, provenance truth, or grouped-file truth from local heuristics when canonical service data exists.

## 12. Edge Cases

### 12.1 Large reviews (100+ files)

- The file tree already avoids rendering diff hunks until a file is expanded; this is necessary and SHALL remain.
- `DiffView` currently expands the first five files by default. For 100+ file reviews, that limit is acceptable as a bounded initial render strategy.
- **AMBIGUITY:** No virtualization is currently implemented for the file tree, annotations panel, or diff list. Large-review performance therefore depends on bounded default expansion rather than list virtualization.

### 12.2 Very long files

- Long files SHALL remain collapsed until explicitly expanded.
- Long-file rendering SHALL use lazy hunk fetch rather than preloading every hunk for the entire review detail page.
- **AMBIGUITY:** There is no explicit line-window virtualization in the current diff renderer.

### 12.3 Deep comment threads

- Inline comment threads currently show the first three comments and collapse the remainder behind a toggle.
- The annotations panel currently renders all comments grouped by file with no per-thread collapsing, which may become noisy for deep threads.

### 12.4 UI updates during lifecycle transition

- The current status update flow sets local `status` only after the HTTP mutation succeeds; that is server-confirmed, not optimistic.
- If the mutation fails, the UI keeps the previous status and logs the error.
- This server-confirmed approach is the canonical behavior until SPEC-001 introduces explicit lifecycle operations.

### 12.5 Review opened while analysis is running

- The target UI SHALL present an analysis state and delay annotation affordances until the review reaches `ready`.
- **Current gap:** no such state exists because the UI only understands `in_progress`.

### 12.6 Exported review

- The target UI SHALL be read-only after export.
- **Current gap:** no exported state or read-only gating exists.

### 12.7 Missing hunks / binary or mode-only changes

- The diff viewer already renders `Binary file or mode change` when expanded content has zero hunks.
- This SHALL remain the explicit empty-hunk treatment rather than showing a blank panel.

## 13. Observability

The following UI-observable behaviors matter for verification:

- route navigation between `/`, `/reviews`, `/reviews/new`, and `/reviews/$reviewId`
- SSE connection status and refresh behavior on the staged changes page
- file-tree selection scrolling the diff pane to the corresponding file container
- lazy hunk loading per file expansion
- inline comment creation and router invalidation after submission
- comment resolve/unresolve/delete actions invalidating review detail state
- todo create/toggle/delete/clear-completed interactions from the root-mounted panel
- status transition actions being reflected only after server success

**AMBIGUITY:** There is no dedicated UI telemetry or tracing surface documented yet. Current observability is primarily behavioral and developer-facing.

## 14. Rollout Considerations

1. Preserve the existing route structure while changing lifecycle semantics underneath it.
2. Cut over review detail and review list from legacy `status` to derived lifecycle state in the same change as SPEC-001 implementation; do not run parallel status models in the UI.
3. Upgrade review detail to subscribe to SSE before claiming realtime behavior for comments/reviews/todos/files.
4. Introduce grouped file tree data as an additive server response, then replace raw-path-only presentation once the persisted grouping contract is stable.
5. Make exported reviews read-only in the UI when export persistence lands.
6. Add branch/commits review creation UI only when the form, validation, and lifecycle/loading states are end-to-end complete.

## 15. Open Questions

- **AMBIGUITY:** Should `/reviews/new` become a multi-source creation form immediately when SPEC-002 UI work lands, or should staged remain the only browser flow until grouped/provenance review detail is also ready?
- **AMBIGUITY:** How should the review detail page visually distinguish `ready` from `in_review` once SPEC-001 split lifecycle fields exist?
- **AMBIGUITY:** Should review-scoped todos live inside the review detail layout as a dedicated pane/section, or remain in the global root-mounted slide-over filtered to the active review?
- **AMBIGUITY:** Should the annotations panel filter to `selectedFile` by default or show all files with the selected file highlighted first?
- **AMBIGUITY:** How should grouped file tree artifacts be surfaced when provenance/grouping analysis is unavailable or degraded for an older review snapshot?
- **AMBIGUITY:** Should action-bar export remain available from `changes_requested`, as allowed by the target lifecycle in `docs/ARCHITECTURE.md`, or be policy-restricted by future product rules?

## 16. Acceptance Criteria

This spec is complete when all of the following are true:

- `docs/specs/ui-behavior-interaction.md` exists.
- The document contains all 17 mandatory sections required by the task.
- The route structure is explicitly documented with a route table covering current browser URLs.
- Lifecycle-to-UI state mapping is documented and cross-referenced to SPEC-001.
- The review detail layout is specified in terms of file tree, diff viewer, annotations panel, action bar, and todo panel.
- The annotation panel interaction model is specified, including the current gap that `selectedFile` and `reviewId` props are declared but unused in `src/routes/-shared/layout/annotations-panel.tsx`.
- Grouped file tree behavior is specified as the architectural target, while documenting that the current implementation is raw path hierarchy plus collapsible directories.
- Realtime behavior is specified from current SSE evidence and notes the current gap that review detail does not yet subscribe.
- Current UI implementation gaps are explicitly identified rather than hidden behind target-state prose.
