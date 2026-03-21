# MCP Agent Guide

## Overview

Ringi exposes MCP as a local stdio codemode adapter over the same review services used by the app and CLI. An agent connects to `ringi mcp`, calls one MCP tool named `execute`, and runs constrained JavaScript inside a sandbox where the available surface is review-scoped and routed through the core service layer: reviews, todos, sources, intelligence, events, and session. The boundary is intentional: Ringi helps agents inspect, create, explain, and verify review work inside a review session, not roam the repository as a generic code exploration product.

## Why Codemode

Traditional MCP servers usually register one tool per operation: `review_list`, `review_detail`, `review_files`, `review_diff`, `review_comments`, and so on. That shape looks simple at first, but it is the wrong fit for Ringi.

Ringi is a review workbench, not a bag of unrelated RPC calls. Real agent workflows are multi-step: inspect the current review, filter changed files, fetch only the diff for risky files, cross-check unresolved comments, attach provenance, export markdown, and then run validation. A tool-per-operation MCP forces the agent to bounce across many round trips, carry intermediate state outside the server, and reconstruct domain logic that Ringi already owns.

A single `execute` tool with a constrained JavaScript sandbox is better for this product for five reasons:

1. Reduced round trips. The agent can compose several domain calls in one execution instead of paying transport overhead for each small step.
2. Composability. The sandbox exposes namespaced objects, so an agent can write simple review logic close to the data instead of emulating a workflow through dozens of tiny tool invocations.
3. Multi-step workflows. Review work is sequential and conditional. Codemode lets the agent branch, aggregate, filter, and short-circuit in one place.
4. Agent expressiveness. Agents are good at writing small bits of glue logic. Ringi should expose stable domain primitives, not force every meaningful workflow to wait for a new top-level MCP tool.
5. Architectural alignment. The roadmap is explicit: UI, CLI, and MCP are adapters over shared services. Codemode keeps the MCP contract narrow while letting the domain surface evolve without proliferating transport-level tools.

The tradeoff is real: the agent must write JavaScript instead of selecting from a menu of tiny tools. That is the one disadvantage. Ringi accepts that trade because the upside is a stable transport, fewer protocol hops, and a domain model that matches how review automation actually works.

Compared with a traditional tool-per-operation MCP:

- Traditional MCP is easier to demo, but becomes noisy and brittle as the surface grows.
- Codemode requires slightly more agent capability, but keeps the transport contract fixed at one tool.
- Traditional MCP pushes orchestration into the client.
- Codemode keeps orchestration close to the review-scoped API surface.
- Traditional MCP encourages transport-first thinking.
- Codemode encourages domain-first thinking.

## Starting the MCP Server

Start the server over stdio:

```bash
ringi mcp
```

Start it in read-only mode:

```bash
ringi mcp --readonly
```

Agents connect over stdio exactly like any other local MCP server. `--readonly` is enforced by the adapter: mutating sandbox calls are rejected before they reach storage or any write path. This is the recommended default for agents doing inspection, export, or self-verification.

Example client configuration:

```json
{
  "mcpServers": {
    "ringi": {
      "command": "ringi",
      "args": ["mcp", "--readonly"]
    }
  }
}
```

## The Execute Tool

Ringi exposes one MCP tool:

```ts
type ExecuteInput = {
  code: string;
  timeout?: number;
};

type ExecuteOutput = {
  ok: boolean;
  result: any;
  error?: string;
  truncated?: boolean;
};
```

Behavior contract:

- `code` is a JavaScript snippet evaluated inside the Ringi sandbox.
- `timeout` is optional, measured in milliseconds.
- Default timeout is `30_000` ms.
- Maximum timeout is `120_000` ms. Larger values may be clamped.
- `ok: true` means the snippet completed successfully.
- `ok: false` means execution failed or was rejected.
- `result` contains the returned value when successful. On failure it is typically `null`.
- `error` is a human-readable failure string.
- `truncated: true` means the returned payload exceeded the adapter output budget and was shortened.

Timeout behavior:

- If `timeout` is omitted, Ringi uses `30_000` ms.
- Long-running flows such as validation should request a larger timeout explicitly.
- Timeout failure returns `ok: false` with an `error` describing the timeout.
- A timeout is inconclusive. Agents should not treat it as evidence that validation passed or failed.

Truncation policy:

- If the serialized output exceeds `100KB`, Ringi truncates the result and sets `truncated: true`.
- Truncation is explicit. Agents must check the flag.
- Agents should respond by narrowing scope, requesting smaller shapes, or chunking work.

Security boundaries:

- No filesystem access.
- No network access.
- No process spawning.
- No arbitrary module loading.
- Only the Ringi API surface documented below is available inside the sandbox.

Execution context:

- JavaScript execution environment.
- `async` / `await` supported.
- Top-level `await` supported.
- Each `execute` call is isolated. No persistent in-memory state is carried across calls.

Example:

```ts
await execute({
  code: `
    const ctx = await session.context();
    return {
      repository: ctx.repository,
      activeReviewId: ctx.activeReviewId,
      readonly: ctx.readonly,
    };
  `,
});
```

## API Surface

The following globals are available inside the `execute` sandbox:

```ts
declare const reviews: ReviewsNamespace;
declare const todos: TodosNamespace;
declare const sources: SourcesNamespace;
declare const intelligence: IntelligenceNamespace;
declare const events: EventsNamespace;
declare const session: SessionNamespace;
```

### `reviews`

Review session operations. Phase 1 is read-heavy. Phase 3 adds review creation.

```ts
type ReviewStatus = "in_progress" | "approved" | "changes_requested";
type ReviewSourceType = "staged" | "branch" | "commits";
type ReviewId = string;
type SnapshotId = string;
type FilePath = string;
type CommentStatus = "open" | "resolved";

type ReviewListFilter = {
  status?: ReviewStatus[];
  sourceType?: ReviewSourceType[];
  limit?: number;
};

type ReviewCreateInput = {
  title?: string;
  source: {
    type: ReviewSourceType;
    baseRef?: string | null;
    headRef?: string | null;
    commits?: string[];
  };
  provenance?: Provenance[];
  groupHints?: string[];
};

type ReviewDiffQuery = {
  reviewId: ReviewId;
  filePath: FilePath;
  contextLines?: number;
};

type ReviewExportOptions = {
  reviewId: ReviewId;
  includeResolved?: boolean;
  includeSuggestions?: boolean;
};

interface ReviewsNamespace {
  /** Read-only. Phase 1. List reviews visible to the current repository context. */
  list(filter?: ReviewListFilter): Promise<Review[]>;

  /** Read-only. Phase 1. Fetch one review with snapshot anchoring and aggregate stats. */
  get(reviewId: ReviewId): Promise<Review>;

  /** Mutating. Phase 3. Create a review from staged, branch, or commit sources. */
  create(input: ReviewCreateInput): Promise<Review>;

  /** Read-only. Phase 1. Return changed files, groups, provenance, and confidence. */
  getFiles(reviewId: ReviewId): Promise<ReviewFile[]>;

  /** Read-only. Phase 1. Return diff hunks for one changed file. */
  getDiff(query: ReviewDiffQuery): Promise<ReviewFile>;

  /** Read-only. Phase 1. Return comments attached to the review, optionally file-scoped. */
  getComments(reviewId: ReviewId, filePath?: FilePath): Promise<Comment[]>;

  /** Read-only. Phase 1. Return extracted suggestions attached to review comments. */
  getSuggestions(reviewId: ReviewId): Promise<Suggestion[]>;

  /** Read-only. Phase 1. Return review status plus unresolved/resolved counts. */
  getStatus(reviewId: ReviewId): Promise<{
    reviewId: ReviewId;
    status: ReviewStatus;
    totalComments: number;
    unresolvedComments: number;
    resolvedComments: number;
    withSuggestions: number;
  }>;

  /** Read-only. Phase 1. Export a review as markdown. */
  export(options: ReviewExportOptions): Promise<{
    reviewId: ReviewId;
    markdown: string;
  }>;
}
```

### `todos`

Todo operations. Todo mutations are the only write path before Phase 3 review creation.

```ts
type TodoId = string;

type TodoStatus = "open" | "done";

type TodoListFilter = {
  reviewId?: ReviewId | null;
  status?: TodoStatus;
};

type TodoCreateInput = {
  text: string;
  reviewId?: ReviewId | null;
};

interface TodosNamespace {
  /** Read-only. Phase 1. List todos globally or for one review. */
  list(filter?: TodoListFilter): Promise<Todo[]>;

  /** Mutating. Late Phase 1 / Phase 1.5. Add a todo. Rejected in readonly mode. */
  add(input: TodoCreateInput): Promise<Todo>;

  /** Mutating. Late Phase 1 / Phase 1.5. Mark a todo done. Rejected in readonly mode. */
  done(todoId: TodoId): Promise<Todo>;

  /** Mutating. Late Phase 1 / Phase 1.5. Mark a todo undone. Rejected in readonly mode. */
  undone(todoId: TodoId): Promise<Todo>;

  /** Mutating. Late Phase 1 / Phase 1.5. Move a todo to a new position. */
  move(todoId: TodoId, position: number): Promise<Todo[]>;

  /** Mutating. Late Phase 1 / Phase 1.5. Remove one todo. */
  remove(todoId: TodoId): Promise<{ success: true }>;

  /** Mutating. Late Phase 1 / Phase 1.5. Clear todos, optionally scoped to a review. */
  clear(reviewId?: ReviewId | null): Promise<{ success: true; removed: number }>;
}
```

### `sources`

Review-source discovery and diff preview. This lets an agent understand what could become a review before it creates one.

```ts
type SourcePreview = {
  source: ReviewSource;
  summary: {
    totalFiles: number;
    totalAdditions: number;
    totalDeletions: number;
  };
  files: Array<{
    path: string;
    status: ReviewFileStatus;
    additions: number;
    deletions: number;
  }>;
};

type ReviewSource =
  | { type: "staged" }
  | { type: "branch"; baseRef: string; headRef: string }
  | { type: "commits"; commits: string[] };

interface SourcesNamespace {
  /** Read-only. Phase 1. List available review sources for the current repository. */
  list(): Promise<{
    staged: { available: boolean };
    branches: Array<{ name: string; current: boolean }>;
    recentCommits: Array<{ hash: string; author: string; date: string; message: string }>;
  }>;

  /** Read-only. Phase 1. Preview diff summary and files for a candidate review source. */
  previewDiff(source: ReviewSource): Promise<SourcePreview>;
}
```

### `intelligence`

Review-scoped analysis. These operations are Phase 2+ because they depend on review intelligence artifacts and evidence, and that same data powers the impact minimap in the UI.

```ts
type RelationshipKind =
  | "imports"
  | "calls"
  | "re_exports"
  | "renames"
  | "configuration"
  | "test_coverage";

type ValidateOptions = {
  reviewId: ReviewId;
  checks?: Array<"changed_exports" | "unresolved_comments" | "impact_coverage" | "confidence_gaps">;
};

interface IntelligenceNamespace {
  /** Read-only. Phase 2. Return relationship edges and supporting evidence for changed files. */
  getRelationships(reviewId: ReviewId): Promise<Relationship[]>;

  /** Read-only. Phase 2. Return impacted files and uncovered dependents for the review, including inputs used by the impact minimap. */
  getImpacts(reviewId: ReviewId): Promise<Array<{
    fileId: string;
    path: string;
    impactedBy: string[];
    uncoveredDependents: string[];
    confidence: number;
  }>>;

  /** Read-only. Phase 2. Return confidence scores and reasons for changed files or groups. */
  getConfidence(reviewId: ReviewId): Promise<ConfidenceScore[]>;

  /** Read-only. Phase 2. Run deterministic self-verification checks for the review. */
  validate(options: ValidateOptions): Promise<{
    reviewId: ReviewId;
    ok: boolean;
    checks: Array<{
      kind: string;
      ok: boolean;
      message: string;
      relatedFiles?: string[];
    }>;
  }>;
}
```

### `events`

Review event access. Events let agents react to review lifecycle changes without polling each slice manually.

```ts
type ReviewEventType =
  | "reviews.updated"
  | "comments.updated"
  | "todos.updated"
  | "files.changed";

type EventSubscription = {
  id: string;
  eventTypes: ReviewEventType[];
  reviewId?: ReviewId;
};

interface EventsNamespace {
  /** Read-only. Phase 1. Subscribe to review-scoped events during the current execute call. */
  subscribe(filter?: {
    eventTypes?: ReviewEventType[];
    reviewId?: ReviewId;
  }): Promise<EventSubscription>;

  /** Read-only. Phase 1. Return recent buffered events for the current repository context. */
  listRecent(filter?: {
    reviewId?: ReviewId;
    limit?: number;
  }): Promise<ReviewEvent[]>;
}
```

### `session`

Repository and adapter context. Agents should call this first when they do not already know the active review boundary.

```ts
interface SessionNamespace {
  /** Read-only. Phase 1. Return repository, adapter, and active review context. */
  context(): Promise<{
    repository: {
      name: string;
      path: string;
      branch: string;
      remote?: string | null;
    };
    readonly: boolean;
    serverMode: "stdio";
    activeReviewId?: ReviewId | null;
    activeSnapshotId?: SnapshotId | null;
  }>;

  /** Read-only. Phase 1. Return server status for health checks and agent gating. */
  status(): Promise<{
    ok: true;
    readonly: boolean;
    activeSubscriptions: number;
    currentPhase: "phase1" | "phase2" | "phase3";
  }>;
}
```

## Data Models

```ts
type ReviewSourceType = "staged" | "branch" | "commits";
type ReviewStatus = "in_progress" | "approved" | "changes_requested";
type ReviewFileStatus = "added" | "modified" | "deleted" | "renamed";
type CommentStatus = "open" | "resolved";
type TodoStatus = "open" | "done";

type Review = {
  id: string;
  snapshotId: string;
  title: string;
  source: {
    type: ReviewSourceType;
    baseRef?: string | null;
    headRef?: string | null;
    commits?: string[];
  };
  status: ReviewStatus;
  createdAt: string;
  updatedAt: string;
  fileCount: number;
  stats: {
    totalComments: number;
    unresolvedComments: number;
    totalTodos: number;
    completedTodos: number;
  };
};

type DiffLine = {
  type: "added" | "removed" | "context";
  oldLineNumber: number | null;
  newLineNumber: number | null;
  content: string;
};

type DiffHunk = {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
};

type ReviewFile = {
  id: string;
  reviewId: string;
  path: string;
  oldPath?: string;
  status: ReviewFileStatus;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  provenance?: Provenance | null;
  confidence?: ConfidenceScore | null;
  groupId?: string | null;
};

type Comment = {
  id: string;
  reviewId: string;
  fileId: string;
  filePath: string;
  line: number | null;
  lineType: "added" | "removed" | "context" | null;
  body: string;
  status: CommentStatus;
  suggestion?: Suggestion | null;
  author: "human" | "agent" | "system";
  createdAt: string;
};

type Suggestion = {
  id: string;
  commentId: string;
  originalCode: string;
  suggestedCode: string;
};

type Todo = {
  id: string;
  reviewId?: string | null;
  text: string;
  status: TodoStatus;
  position: number;
};

type Provenance = {
  fileId: string;
  reason: string;
  step: string;
  agent?: string;
  confidence: number;
  metadata?: Record<string, unknown>;
};

type Relationship = {
  sourceFile: string;
  targetFile: string;
  kind: RelationshipKind;
  evidence: Array<{
    path: string;
    line: number;
    excerpt: string;
  }>;
  confidence: number;
};

type Group = {
  id: string;
  label: string;
  files: string[];
  stats: {
    totalFiles: number;
    totalAdditions: number;
    totalDeletions: number;
  };
};

type ConfidenceScore = {
  fileId: string;
  score: number;
  reasons: string[];
};

type ReviewEvent = {
  type: ReviewEventType;
  reviewId?: string;
  timestamp: number;
  payload?: unknown;
};
```

The `Group` shape is the contract for a grouped file tree, so agents can preserve logical clusters and their aggregate stats when summarizing review files.

## Usage Patterns

All examples below use the single MCP tool.

### 1. Inspect a review and list changed files

```ts
await execute({
  code: `
    const [ctx, review] = await Promise.all([
      session.context(),
      reviews.get("rev_123"),
    ]);

    const files = await reviews.getFiles(review.id);

    return {
      repository: ctx.repository.name,
      review: {
        id: review.id,
        status: review.status,
        fileCount: review.fileCount,
      },
      changedFiles: files.map((file) => ({
        path: file.path,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
      })),
    };
  `,
});
```

### 2. Handle a zero-file review explicitly

```ts
await execute({
  code: `
    const review = await reviews.get("rev_123");
    const files = await reviews.getFiles(review.id);

    if (files.length === 0) {
      return {
        reviewId: review.id,
        status: review.status,
        message: "Review contains no changed files. Skip diff analysis and inspect comments/todos only.",
      };
    }

    return { reviewId: review.id, fileCount: files.length };
  `,
});
```

### 3. Read diff context for a specific file

```ts
await execute({
  code: `
    const diff = await reviews.getDiff({
      reviewId: "rev_123",
      filePath: "src/routes/api/-lib/services/review.service.ts",
      contextLines: 8,
    });

    return diff.hunks.slice(0, 2);
  `,
});
```

### 4. Attach provenance when creating a review

```ts
await execute({
  code: `
    const created = await reviews.create({
      title: "Agent update for review intelligence pipeline",
      source: { type: "branch", baseRef: "main", headRef: "agent/review-intelligence" },
      provenance: [
        {
          fileId: "src/routes/api/-lib/services/review.service.ts",
          reason: "Adjusted review snapshot parsing to carry machine-readable provenance",
          step: "implementation",
          agent: "codemod-agent",
          confidence: 0.82,
          metadata: { ticket: "P1.4" },
        },
      ],
      groupHints: ["review intelligence", "storage"],
    });

    return { reviewId: created.id, status: created.status };
  `,
});
```

### 5. Analyze unresolved comments and open todos from one pass

```ts
await execute({
  code: `
    const reviewId = "rev_123";
    const [comments, status, todoList] = await Promise.all([
      reviews.getComments(reviewId),
      reviews.getStatus(reviewId),
      todos.list({ reviewId, status: "open" }),
    ]);

    const unresolved = comments.filter((comment) => comment.status === "open");

    return {
      unresolvedComments: unresolved.map((comment) => ({
        id: comment.id,
        filePath: comment.filePath,
        line: comment.line,
        body: comment.body,
        hasSuggestion: Boolean(comment.suggestion),
      })),
      unresolvedCount: status.unresolvedComments,
      openTodos: todoList,
    };
  `,
});
```

### 6. Export a review to markdown

```ts
await execute({
  code: `
    const exported = await reviews.export({
      reviewId: "rev_123",
      includeResolved: false,
      includeSuggestions: true,
    });

    return {
      reviewId: exported.reviewId,
      preview: exported.markdown.slice(0, 600),
      length: exported.markdown.length,
    };
  `,
});
```

### 7. Check impact relationships for changed exports

```ts
await execute({
  code: `
    const reviewId = "rev_123";
    const [relationships, impacts] = await Promise.all([
      intelligence.getRelationships(reviewId),
      intelligence.getImpacts(reviewId),
    ]);

    const exportRelated = relationships.filter((edge) =>
      edge.kind === "imports" || edge.kind === "re_exports"
    );

    return {
      relationships: exportRelated,
      impacts,
    };
  `,
  timeout: 45_000,
});
```

### 8. Validate whether changed exports have updated dependents

```ts
await execute({
  code: `
    return intelligence.validate({
      reviewId: "rev_123",
      checks: ["changed_exports", "impact_coverage"],
    });
  `,
  timeout: 60_000,
});
```

### 9. Subscribe to review events and inspect recent activity

```ts
await execute({
  code: `
    const subscription = await events.subscribe({
      reviewId: "rev_123",
      eventTypes: ["reviews.updated", "comments.updated", "files.changed"],
    });

    const recent = await events.listRecent({ reviewId: "rev_123", limit: 20 });

    return {
      subscription,
      recent,
    };
  `,
});
```

### 10. Run a multi-step workflow: inspect → analyze → todo → validate

```ts
await execute({
  code: `
    const ctx = await session.context();
    const reviewId = ctx.activeReviewId ?? "rev_123";

    const [review, files, comments] = await Promise.all([
      reviews.get(reviewId),
      reviews.getFiles(reviewId),
      reviews.getComments(reviewId),
    ]);

    const unresolved = comments.filter((comment) => comment.status === "open");
    const riskyFiles = files.filter((file) => (file.confidence?.score ?? 1) < 0.6);

    if (unresolved.length > 0) {
      await todos.add({
        reviewId,
        text: `Resolve ${unresolved.length} open comment(s) before approval`,
      });
    }

    const validation = await intelligence.validate({
      reviewId,
      checks: ["unresolved_comments", "confidence_gaps"],
    });

    return {
      review: { id: review.id, status: review.status },
      riskyFiles: riskyFiles.map((file) => ({ path: file.path, score: file.confidence?.score ?? null })),
      unresolvedComments: unresolved.length,
      validation,
    };
  `,
  timeout: 60_000,
});
```

### 11. Detect and handle truncation

```ts
const response = await execute({
  code: `
    const files = await reviews.getFiles("rev_123");
    return files;
  `,
});

if (response.truncated) {
  const narrowed = await execute({
    code: `
      const files = await reviews.getFiles("rev_123");
      return files.map((file) => ({
        path: file.path,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
      }));
    `,
  });
}
```

### 12. Detect readonly rejection before mutating

```ts
await execute({
  code: `
    const ctx = await session.context();
    if (ctx.readonly) {
      return { skipped: true, reason: "Server is running in readonly mode" };
    }

    return todos.add({ reviewId: "rev_123", text: "Follow up on unresolved diff comments" });
  `,
});
```

### 13. Observe a readonly rejection from the adapter

```ts
await execute({
  code: `
    return reviews.create({
      title: "Readonly should reject this",
      source: { type: "staged" },
    });
  `,
});
```

Expected failure shape:

```ts
{
  ok: false,
  result: null,
  error: "Mutation rejected: MCP server is running in readonly mode"
}
```

### 14. Handle a timeout explicitly

```ts
const response = await execute({
  code: `
    return intelligence.validate({
      reviewId: "rev_123",
      checks: ["changed_exports", "impact_coverage", "confidence_gaps"],
    });
  `,
  timeout: 1_000,
});

if (!response.ok && response.error?.includes("timeout")) {
  // Retry with a narrower check set or a larger timeout.
}
```

## Best Practices for Agents

- Prefer batch reads over N small loops. Fetch review, files, comments, and todos together when you can.
- Call `session.context()` first when the active review or readonly state is unknown.
- Check review status before mutating. Do not add todos or attempt review creation blindly.
- Treat `truncated: true` as a first-class signal. Narrow the request or return a smaller projection.
- Keep analysis review-scoped. Do not infer repository-wide truth from a review-scoped surface.
- When using intelligence outputs, require evidence and reasons. Confidence without explanation is useless in review.
- Preserve relationship and impact evidence when condensing results; that context is what enables reliable graph-diff bridging in the UI.
- Use `--readonly` for inspection and self-verification agents.
- Prefer one thoughtful `execute` snippet over many tiny calls. Codemode is there to reduce transport noise.

## Error Handling

Common failure classes:

```ts
type ExecuteErrorKind =
  | "readonly_rejection"
  | "timeout"
  | "validation_error"
  | "not_found"
  | "truncated_result"
  | "phase_unavailable"
  | "sandbox_error";
```

Recovery patterns:

- `readonly_rejection`: call `session.context()` or `session.status()`, then skip or reconnect without `--readonly`.
- `timeout`: retry with a larger timeout or fewer checks. Do not interpret timeout as a clean negative result.
- `validation_error`: inspect the message, correct the request shape, and retry.
- `not_found`: re-fetch current review context; stale review ids are common after review recreation.
- `truncated_result`: narrow scope or project fewer fields.
- `phase_unavailable`: the method exists in the guide but is not shipped in the current server phase yet.
- `sandbox_error`: your JavaScript threw or returned an unsupported shape. Fix the snippet, not the transport.

Minimal detection pattern:

```ts
const response = await execute({ code: `return session.status();` });

if (!response.ok) {
  return {
    recoverable: Boolean(response.error),
    error: response.error,
  };
}

return response.result;
```

## Limitations

Ringi intentionally excludes several things from MCP:

- No filesystem access.
- No raw git operations.
- No network calls.
- No process spawning.
- No arbitrary code execution outside the sandbox.
- No persistent state across `execute` calls.
- No generic repository exploration product surface.

These are not omissions by accident. The roadmap is explicit: MCP is a review-scoped adapter for inspection, explanation, export, and verification inside a review boundary.

## Read-Only vs Mutating Operations

| Namespace | Operation | Mode | Phase |
| --- | --- | --- | --- |
| `reviews` | `list`, `get`, `getFiles`, `getDiff`, `getComments`, `getSuggestions`, `getStatus`, `export` | Read-only | Phase 1 |
| `reviews` | `create` | Mutating | Phase 3 |
| `todos` | `list` | Read-only | Phase 1 |
| `todos` | `add`, `done`, `undone`, `move`, `remove`, `clear` | Mutating | Late Phase 1 / Phase 1.5 |
| `sources` | `list`, `previewDiff` | Read-only | Phase 1 |
| `intelligence` | `getRelationships`, `getImpacts`, `getConfidence`, `validate` | Read-only | Phase 2 |
| `events` | `subscribe`, `listRecent` | Read-only | Phase 1 |
| `session` | `context`, `status` | Read-only | Phase 1 |

Rule of thumb:

- All Phase 1 review inspection is read-only.
- Todo mutations are allowed before review creation lands.
- Review creation is Phase 3.
- `--readonly` rejects every mutating operation regardless of phase.

## Comparison with Traditional MCP

Ringi does not register 30+ transport tools because that would make the protocol noisier than the domain. Traditional MCP would expose one tool per operation and force the agent to orchestrate the review workflow outside the server. Ringi instead exposes one tool, `execute`, and puts a constrained review API inside the sandbox.

Advantages:

- fewer protocol round trips
- better composability
- easier multi-step review logic
- stable transport contract as the domain grows
- better alignment with shared service adapters

Disadvantage:

- the agent must write JavaScript snippets instead of selecting a pre-baked tool for every step

That is the correct trade for Ringi because the product value is the review loop, not the tool catalog.
