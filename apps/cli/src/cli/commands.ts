import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { ReviewId } from "@ringi/core/schemas/review";
import { CommentService } from "@ringi/core/services/comment.service";
import { getDiffSummary, parseDiff } from "@ringi/core/services/diff.service";
import { ExportService } from "@ringi/core/services/export.service";
import { GitService } from "@ringi/core/services/git.service";
import { runPreflight } from "@ringi/core/services/pr-preflight";
import {
  createOrResumePrSession,
  forceRefreshPrSession,
  prSourceRef,
} from "@ringi/core/services/pr-session";
import { parsePrUrl } from "@ringi/core/services/pr-url";
import { ReviewService } from "@ringi/core/services/review.service";
import { TodoService } from "@ringi/core/services/todo.service";
import * as Effect from "effect/Effect";

import { CliConfig } from "@/cli/config";
import { CliFailure, ExitCode } from "@/cli/contracts";
import type { CommandOutput, NextAction, ParsedCommand } from "@/cli/contracts";

// ---------------------------------------------------------------------------
// View-model interfaces (decoupled from service response shapes)
// ---------------------------------------------------------------------------

interface ReviewListRow {
  readonly createdAt: string;
  readonly fileCount: number;
  readonly id: string;
  readonly sourceType: string;
  readonly status: string;
}

interface ReviewShowComment {
  readonly content: string;
  readonly filePath: string;
  readonly lineNumber: number | null;
  readonly resolved: boolean;
}

interface ReviewShowFile {
  readonly additions: number;
  readonly deletions: number;
  readonly filePath: string;
  readonly status: string;
}

interface ReviewShowSummary {
  readonly totalAdditions: number;
  readonly totalDeletions: number;
  readonly totalFiles: number;
}

interface ReviewShowReview {
  readonly createdAt: string;
  readonly files: readonly ReviewShowFile[];
  readonly id: string;
  readonly sourceRef: string | null;
  readonly sourceType: string;
  readonly status: string;
  readonly summary: ReviewShowSummary;
}

interface ReviewShowTodo {
  readonly completed: boolean;
  readonly content: string;
  readonly position: number;
}

interface ReviewShowData {
  readonly comments?: readonly ReviewShowComment[];
  readonly review: ReviewShowReview;
  readonly todos?: readonly ReviewShowTodo[];
}

interface TodoListItem {
  readonly completed: boolean;
  readonly content: string;
  readonly position: number;
}

interface SourceListBranch {
  readonly current: boolean;
  readonly name: string;
}

interface SourceListCommit {
  readonly author: string;
  readonly hash: string;
  readonly message: string;
}

interface SourceListRepo {
  readonly branch: string;
  readonly name: string;
  readonly path: string;
  readonly remote: string | null;
}

interface SourceListStagedFile {
  readonly path: string;
  readonly status: string;
}

interface SourceListData {
  readonly branches: readonly SourceListBranch[];
  readonly commits: readonly SourceListCommit[];
  readonly repo: SourceListRepo;
  readonly stagedFiles: readonly SourceListStagedFile[];
}

// ---------------------------------------------------------------------------
// Renderers (pure functions, no effects)
// ---------------------------------------------------------------------------

const formatTable = (
  headers: readonly string[],
  rows: readonly (readonly string[])[]
): string => {
  const widths = headers.map((header, index) => {
    const cellWidths = rows.map((row) => row[index]?.length ?? 0);
    return Math.max(header.length, ...cellWidths);
  });

  const renderRow = (row: readonly string[]) =>
    row
      .map((cell, index) => cell.padEnd(widths.at(index) ?? 0))
      .join("  ")
      .trimEnd();

  return [
    renderRow(headers),
    renderRow(widths.map((width) => "-".repeat(width))),
    ...rows.map(renderRow),
  ].join("\n");
};

const renderReviewList = (reviews: readonly ReviewListRow[]): string => {
  if (reviews.length === 0) {
    return "No reviews found.";
  }

  return formatTable(
    ["ID", "STATUS", "SOURCE", "FILES", "CREATED"],
    reviews.map((review) => [
      review.id,
      review.status,
      review.sourceType,
      String(review.fileCount),
      review.createdAt,
    ])
  );
};

const renderReviewShow = (input: ReviewShowData): string => {
  const { comments, review, todos } = input;
  const lines = [
    `Review ${review.id}`,
    `Status: ${review.status}`,
    `Source: ${review.sourceType}${review.sourceRef ? ` (${review.sourceRef})` : ""}`,
    `Created: ${review.createdAt}`,
    `Files: ${review.summary.totalFiles}`,
    `Diff: +${review.summary.totalAdditions} / -${review.summary.totalDeletions}`,
  ];

  if (review.files.length > 0) {
    lines.push("", "Files:");
    for (const file of review.files) {
      lines.push(
        `- ${file.status.toUpperCase()} ${file.filePath} (+${file.additions} -${file.deletions})`
      );
    }
  }

  if (comments && comments.length > 0) {
    lines.push("", "Comments:");
    for (const comment of comments) {
      const location = `${comment.filePath}:${comment.lineNumber ?? "-"}`;
      const state = comment.resolved ? "resolved" : "open";
      lines.push(`- [${state}] ${location} ${comment.content}`);
    }
  }

  if (todos && todos.length > 0) {
    lines.push("", "Todos:");
    for (const todo of todos) {
      const marker = todo.completed ? "x" : " ";
      lines.push(`- [${marker}] (${todo.position + 1}) ${todo.content}`);
    }
  }

  return lines.join("\n");
};

const renderTodoList = (todos: readonly TodoListItem[]): string => {
  if (todos.length === 0) {
    return "No todos found.";
  }

  return todos
    .map(
      (todo) =>
        `- [${todo.completed ? "x" : " "}] (${todo.position + 1}) ${todo.content}`
    )
    .join("\n");
};

const renderSourceList = (input: SourceListData): string => {
  const lines = [
    `Repository: ${input.repo.name}`,
    `Path: ${input.repo.path}`,
    `Current branch: ${input.repo.branch}`,
    `Staged files: ${input.stagedFiles.length}`,
  ];

  if (input.stagedFiles.length > 0) {
    lines.push("", "Staged:");
    for (const file of input.stagedFiles) {
      lines.push(`- ${file.status} ${file.path}`);
    }
  }

  if (input.branches.length > 0) {
    lines.push("", "Branches:");
    for (const branch of input.branches.slice(0, 10)) {
      lines.push(`- ${branch.current ? "*" : " "} ${branch.name}`);
    }
  }

  if (input.commits.length > 0) {
    lines.push("", "Recent commits:");
    for (const commit of input.commits.slice(0, 5)) {
      lines.push(
        `- ${commit.hash.slice(0, 8)} ${commit.message} (${commit.author})`
      );
    }
  }

  return lines.join("\n");
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Resolves the special "last" selector before show/export handlers ask the
 * shared services for a concrete review id.
 */
const resolveReviewSelector = Effect.fn("CLI.resolveReviewSelector")(
  function* resolveReviewSelector(selector: string) {
    if (selector !== "last") {
      return selector as ReviewId;
    }

    const cliConfig = yield* CliConfig;
    const reviewService = yield* ReviewService;
    const result = yield* reviewService.list({
      page: 1,
      pageSize: 1,
      repositoryPath: cliConfig.repoRoot,
    });
    const [review] = result.reviews;

    if (!review) {
      return yield* new CliFailure({
        exitCode: ExitCode.ResourceNotFound,
        message: "No review sessions exist for this repository yet.",
      });
    }

    return review.id;
  }
);

/**
 * Mutating CLI commands stay server-backed so they share the same write path as
 * the other clients instead of growing a second local-only behavior surface.
 */
const requireServerMode = (label: string) =>
  Effect.fail(
    new CliFailure({
      details: "Start 'ringi serve' and retry the command.",
      exitCode: ExitCode.StateUnavailable,
      message: `${label} requires a running local Ringi server. Standalone local writes are intentionally unsupported.`,
    })
  );

// ---------------------------------------------------------------------------
// Diff source strategies (replaces switch in runSourceDiff)
// ---------------------------------------------------------------------------

type DiffSourceStrategy = (
  git: GitService["Service"],
  command: Extract<ParsedCommand, { kind: "source-diff" }>
) => Effect.Effect<string, unknown>;

const diffSourceStrategies: Readonly<Record<string, DiffSourceStrategy>> = {
  branch: (git, command) => git.getBranchDiff(command.branch ?? ""),
  commits: (git, command) =>
    git.getCommitDiff(
      (command.commits ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  staged: (git) => git.getStagedDiff,
};

// ---------------------------------------------------------------------------
// Command handlers (Effect.fn for tracing)
// ---------------------------------------------------------------------------

const runReviewList = Effect.fn("CLI.reviewList")(function* runReviewList(
  command: Extract<ParsedCommand, { kind: "review-list" }>
) {
  const reviewService = yield* ReviewService;
  const cliConfig = yield* CliConfig;
  const result = yield* reviewService.list({
    page: command.page,
    pageSize: command.limit,
    repositoryPath: cliConfig.repoRoot,
    sourceType: command.source,
    status: command.status,
  });

  const nextActions: NextAction[] = [];
  for (const review of result.reviews.slice(0, 3)) {
    nextActions.push({
      command: `ringi review show ${review.id} --comments --todos`,
      description: `Inspect review ${review.id} (${review.status})`,
    });
  }
  if (result.reviews.length > 0) {
    nextActions.push({
      command: "ringi review show <id> [--comments] [--todos]",
      description: "Show full review details",
      params: {
        id: { description: "Review ID or 'last'", required: true },
      },
    });
  }
  nextActions.push({
    command: "ringi review create [--source <source>]",
    description: "Create a new review session",
    params: {
      source: { default: "staged", enum: ["staged", "branch", "commits"] },
    },
  });

  return {
    data: result,
    human: renderReviewList(result.reviews),
    nextActions,
  } satisfies CommandOutput<typeof result>;
});

const runReviewShow = Effect.fn("CLI.reviewShow")(function* runReviewShow(
  command: Extract<ParsedCommand, { kind: "review-show" }>
) {
  const reviewService = yield* ReviewService;
  const todoService = yield* TodoService;
  const commentService = yield* CommentService;
  const reviewId = yield* resolveReviewSelector(command.id);
  const review = yield* reviewService.getById(reviewId);
  const comments = command.comments
    ? yield* commentService.getByReview(reviewId)
    : undefined;
  const todos = command.todos
    ? (yield* todoService.list({ reviewId })).data
    : undefined;

  const data = { comments, review, todos };
  const nextActions: NextAction[] = [
    {
      command: `ringi review export ${reviewId}`,
      description: "Export this review as markdown",
    },
    {
      command: `ringi review show ${reviewId} --comments --todos`,
      description: "Show with comments and todos",
    },
    {
      command: "ringi todo list [--review <review-id>] [--status <status>]",
      description: "List todos for this review",
      params: {
        "review-id": { value: reviewId },
        status: { default: "pending", enum: ["pending", "done", "all"] },
      },
    },
    {
      command: "ringi review list",
      description: "Back to review list",
    },
  ];

  return {
    data,
    human: renderReviewShow(data),
    nextActions,
  } satisfies CommandOutput<typeof data>;
});

const runReviewExport = Effect.fn("CLI.reviewExport")(function* runReviewExport(
  command: Extract<ParsedCommand, { kind: "review-export" }>
) {
  if (command.noResolved || command.noSnippets) {
    yield* new CliFailure({
      exitCode: ExitCode.UsageError,
      message:
        "--no-resolved and --no-snippets are documented, but the shared export service does not support adapter-level filtering yet.",
    });
  }

  const exportService = yield* ExportService;
  const cliConfig = yield* CliConfig;
  const reviewId = yield* resolveReviewSelector(command.id);
  const markdown = yield* exportService.exportReview(reviewId);
  const outputPath = command.outputPath
    ? resolve(cliConfig.cwd, command.outputPath)
    : undefined;

  if (outputPath) {
    yield* Effect.tryPromise({
      catch: (error) =>
        new CliFailure({
          exitCode: ExitCode.RuntimeFailure,
          message: `Failed to write export to ${outputPath}: ${String(error)}`,
        }),
      try: () => writeFile(outputPath, markdown, "utf8"),
    });
  }

  const shouldPrintMarkdown = command.stdout || !outputPath;
  const data = { markdown, outputPath: outputPath ?? null, reviewId };

  const nextActions: NextAction[] = [
    {
      command: `ringi review show ${reviewId}`,
      description: "View the exported review",
    },
    {
      command: "ringi review list",
      description: "Back to review list",
    },
  ];

  return {
    data,
    human: shouldPrintMarkdown
      ? markdown
      : `Exported review ${reviewId} to ${outputPath}.`,
    nextActions,
  } satisfies CommandOutput<typeof data>;
});

const runSourceList = Effect.fn("CLI.sourceList")(function* runSourceList() {
  const gitService = yield* GitService;
  const repo = yield* gitService.getRepositoryInfo;
  const stagedFiles = yield* gitService.getStagedFiles;
  const branches = yield* gitService.getBranches;
  const commitsResult = yield* gitService.getCommits({
    limit: 10,
    offset: 0,
  });
  const data = {
    branches,
    commits: commitsResult.commits,
    repo,
    stagedFiles,
  };

  const nextActions: NextAction[] = [
    {
      command: "ringi source diff <source> [--stat]",
      description: "View diff for a source",
      params: {
        source: { enum: ["staged", "branch", "commits"] },
      },
    },
    {
      command: "ringi review create [--source <source>]",
      description: "Create a review from a source",
      params: {
        source: { default: "staged", enum: ["staged", "branch", "commits"] },
      },
    },
    {
      command: "ringi review list",
      description: "List existing reviews",
    },
  ];

  return {
    data,
    human: renderSourceList(data),
    nextActions,
  } satisfies CommandOutput<typeof data>;
});

const runSourceDiff = Effect.fn("CLI.sourceDiff")(function* runSourceDiff(
  command: Extract<ParsedCommand, { kind: "source-diff" }>
) {
  const gitService = yield* GitService;
  const strategy = diffSourceStrategies[command.source];

  if (!strategy) {
    return yield* new CliFailure({
      exitCode: ExitCode.UsageError,
      message: "Unsupported review source.",
    });
  }

  const diffText = yield* strategy(gitService, command);

  if (!diffText.trim()) {
    yield* new CliFailure({
      exitCode: ExitCode.RuntimeFailure,
      message: "No diff available for the requested source.",
    });
  }

  const files = parseDiff(diffText);
  const data = {
    diff: diffText,
    source: command.source,
    summary: getDiffSummary(files),
  };

  const nextActions: NextAction[] = [
    {
      command: `ringi review create --source ${command.source}`,
      description: `Create a review from this ${command.source} diff`,
    },
    {
      command: "ringi source list",
      description: "List repository sources",
    },
  ];

  return {
    data,
    human: command.stat
      ? [
          `Source: ${command.source}`,
          `Files: ${data.summary.totalFiles}`,
          `Additions: ${data.summary.totalAdditions}`,
          `Deletions: ${data.summary.totalDeletions}`,
        ].join("\n")
      : diffText,
    nextActions,
  } satisfies CommandOutput<typeof data>;
});

const runReviewStatus = Effect.fn("CLI.reviewStatus")(function* runReviewStatus(
  command: Extract<ParsedCommand, { kind: "review-status" }>
) {
  const reviewService = yield* ReviewService;
  const todoService = yield* TodoService;
  const commentService = yield* CommentService;
  const gitService = yield* GitService;
  const cliConfig = yield* CliConfig;

  const repo = yield* gitService.getRepositoryInfo;
  const stagedFiles = yield* gitService.getStagedFiles;

  // Resolve which review to show status for
  let reviewId: string | undefined;
  if (command.reviewId) {
    reviewId = yield* resolveReviewSelector(command.reviewId);
  }

  // Get the latest review if none specified
  const reviews = yield* reviewService.list({
    page: 1,
    pageSize: 1,
    repositoryPath: cliConfig.repoRoot,
    sourceType: command.source,
  });
  const latestReview = reviewId
    ? yield* reviewService.getById(reviewId as ReviewId)
    : reviews.reviews[0];

  let commentStats:
    | { resolved: number; total: number; unresolved: number }
    | undefined;
  let todoStats:
    | { completed: number; pending: number; total: number }
    | undefined;

  if (latestReview) {
    commentStats = yield* commentService.getStats(latestReview.id);
    todoStats = yield* todoService.getStats();
  }

  const data = {
    commentStats: commentStats ?? null,
    repository: {
      branch: repo.branch,
      name: repo.name,
      path: repo.path,
      stagedFileCount: stagedFiles.length,
    },
    review: latestReview
      ? {
          createdAt: latestReview.createdAt,
          id: latestReview.id,
          sourceType: latestReview.sourceType,
          status: latestReview.status,
        }
      : null,
    todoStats: todoStats ?? null,
  };

  const lines = [
    `Repository: ${repo.name}`,
    `Branch: ${repo.branch}`,
    `Staged files: ${stagedFiles.length}`,
  ];

  if (latestReview) {
    lines.push(
      "",
      `Review: ${latestReview.id}`,
      `Status: ${latestReview.status}`,
      `Source: ${latestReview.sourceType}`
    );
    if (commentStats) {
      lines.push(
        `Comments: ${commentStats.unresolved ?? 0} unresolved / ${commentStats.total} total`
      );
    }
    if (todoStats) {
      lines.push(
        `Todos: ${todoStats.pending} pending / ${todoStats.total} total`
      );
    }
  } else {
    lines.push("", "No review sessions found.");
  }

  const nextActions: NextAction[] = [];
  if (latestReview) {
    nextActions.push(
      {
        command: `ringi review show ${latestReview.id} --comments --todos`,
        description: "Inspect the latest review",
      },
      {
        command: `ringi review export ${latestReview.id}`,
        description: "Export the latest review",
      }
    );
  }
  nextActions.push({
    command: "ringi review create [--source <source>]",
    description: "Create a new review session",
    params: {
      source: { default: "staged", enum: ["staged", "branch", "commits"] },
    },
  });

  return {
    data,
    human: lines.join("\n"),
    nextActions,
  } satisfies CommandOutput<typeof data>;
});

const runTodoList = Effect.fn("CLI.todoList")(function* runTodoList(
  command: Extract<ParsedCommand, { kind: "todo-list" }>
) {
  const todoService = yield* TodoService;
  const result = yield* todoService.list({
    completed: command.status === "all" ? undefined : command.status === "done",
    limit: command.limit,
    offset: command.offset,
    reviewId: command.reviewId,
  });

  const nextActions: NextAction[] = [];
  if (command.reviewId) {
    nextActions.push({
      command: `ringi review show ${command.reviewId}`,
      description: "View the associated review",
    });
  }
  nextActions.push(
    {
      command: "ringi todo add --text <text> [--review <review-id>]",
      description: "Add a new todo",
      params: {
        text: { description: "Todo text", required: true },
      },
    },
    {
      command: "ringi review list",
      description: "List reviews",
    }
  );

  return {
    data: result,
    human: renderTodoList(result.data),
    nextActions,
  } satisfies CommandOutput<typeof result>;
});

// ---------------------------------------------------------------------------
// Command registry (replaces switch-based dispatch)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// PR review handler
// ---------------------------------------------------------------------------

const runReviewPr = Effect.fn("CLI.reviewPr")(function* runReviewPr(
  command: Extract<ParsedCommand, { kind: "review-pr" }>
) {
  // Step 1: parse and validate URL
  const target = yield* parsePrUrl(command.prUrl).pipe(
    Effect.mapError(
      (e) =>
        new CliFailure({
          exitCode: ExitCode.UsageError,
          message: e.message,
        })
    )
  );

  // Step 2: run preflight (gh install, auth, repo, metadata, diff)
  const preflight = yield* runPreflight(target).pipe(
    Effect.mapError(
      (e) =>
        new CliFailure({
          exitCode: e.exitCode as ExitCode,
          message: e.message,
        })
    )
  );

  if (preflight.affinityWarning) {
    yield* Effect.logWarning(preflight.affinityWarning);
  }

  // Step 3: check for force-refresh on existing session
  let session: {
    isResumed: boolean;
    isStale: boolean;
    reviewId: ReviewId;
    staleWarning: string | null;
  };

  if (command.forceRefresh) {
    // Find existing session to refresh
    const reviewService = yield* ReviewService;
    const sourceRef = prSourceRef(target);
    const cliConfig = yield* CliConfig;
    const existing = yield* reviewService.list({
      repositoryPath: cliConfig.repoRoot,
      sourceType: "pull_request",
      pageSize: 100,
    });

    const resumable = existing.reviews.find(
      (r: { sourceRef: string | null; status: string }) =>
        r.sourceRef === sourceRef && r.status !== "approved"
    );

    if (resumable) {
      yield* forceRefreshPrSession(resumable.id as ReviewId, target).pipe(
        Effect.mapError(
          (e) =>
            new CliFailure({
              exitCode: ExitCode.RuntimeFailure,
              message: e.message,
            })
        )
      );
      session = {
        isResumed: true,
        isStale: false,
        reviewId: resumable.id as ReviewId,
        staleWarning: null,
      };
    } else {
      // No existing session — create fresh
      session = yield* createOrResumePrSession(preflight).pipe(
        Effect.mapError(
          (e) =>
            new CliFailure({
              exitCode: ExitCode.RuntimeFailure,
              message: e.message,
            })
        )
      );
    }
  } else {
    // Normal create-or-resume
    session = yield* createOrResumePrSession(preflight).pipe(
      Effect.mapError(
        (e) =>
          new CliFailure({
            exitCode: ExitCode.RuntimeFailure,
            message: e.message,
          })
      )
    );
  }

  if (session.staleWarning) {
    yield* Effect.logWarning(session.staleWarning);
  }

  const serverUrl = `http://localhost:${command.port}`;
  const reviewUrl = `${serverUrl}/review/${session.reviewId}`;

  const data = {
    isResumed: session.isResumed,
    isStale: session.isStale,
    prNumber: target.prNumber,
    prUrl: target.url,
    reviewId: session.reviewId,
    reviewUrl,
  };

  const statusLabel = session.isResumed
    ? command.forceRefresh
      ? "(refreshed)"
      : "(resumed)"
    : "(new)";

  const humanLines = [
    `PR #${target.prNumber}: ${preflight.metadata.title}`,
    `Review: ${session.reviewId} ${statusLabel}`,
    `Author: ${preflight.metadata.author.login}`,
    `Branch: ${preflight.metadata.headRefName} → ${preflight.metadata.baseRefName}`,
    `Files: ${preflight.metadata.changedFiles} (+${preflight.metadata.additions} -${preflight.metadata.deletions})`,
    "",
    `Server: ${serverUrl}`,
    `Review: ${reviewUrl}`,
  ];

  if (preflight.metadata.isDraft) {
    humanLines.splice(1, 0, "⚠ Draft PR");
  }

  if (
    preflight.metadata.state === "CLOSED" ||
    preflight.metadata.state === "MERGED"
  ) {
    humanLines.splice(1, 0, `⚠ This PR is ${preflight.metadata.state}`);
  }

  const nextActions: NextAction[] = [
    {
      command: `ringi review show ${session.reviewId} --comments --todos`,
      description: "Inspect review details",
    },
    {
      command: `ringi review export ${session.reviewId}`,
      description: "Export review as markdown",
    },
  ];

  if (session.isStale) {
    nextActions.unshift({
      command: `ringi review ${command.prUrl} --force-refresh`,
      description: "Re-fetch PR data with latest changes",
    });
  }

  return {
    data,
    human: humanLines.join("\n"),
    nextActions,
  } satisfies CommandOutput<typeof data>;
});

// ---------------------------------------------------------------------------
// Command registry (replaces switch-based dispatch)
// ---------------------------------------------------------------------------

type CommandHandler = (
  command: ParsedCommand
) => Effect.Effect<CommandOutput<unknown>, unknown, unknown>;

/**
 * Data-driven command registry. Each command kind maps to its handler.
 * Adding a new command means adding one entry — no switch duplication.
 */
const COMMAND_HANDLERS: Readonly<Record<string, CommandHandler>> = {
  "data-migrate": () => requireServerMode("ringi data migrate"),
  "data-reset": () => requireServerMode("ringi data reset"),
  doctor: () =>
    Effect.succeed({
      data: { checks: [], ok: true },
      human: "ringi doctor: not yet implemented.",
      nextActions: [],
    } satisfies CommandOutput<unknown>),
  events: () => requireServerMode("ringi events"),
  mcp: () =>
    Effect.fail(
      new CliFailure({
        exitCode: ExitCode.UsageError,
        message:
          "ringi mcp is a runtime command. Use it directly, not through the command dispatcher.",
      })
    ),
  "review-create": () => requireServerMode("ringi review create"),
  "review-export": (c) =>
    runReviewExport(c as Extract<ParsedCommand, { kind: "review-export" }>),
  "review-list": (c) =>
    runReviewList(c as Extract<ParsedCommand, { kind: "review-list" }>),
  "review-pr": (c) =>
    runReviewPr(c as Extract<ParsedCommand, { kind: "review-pr" }>),
  "review-resolve": () => requireServerMode("ringi review resolve"),
  "review-show": (c) =>
    runReviewShow(c as Extract<ParsedCommand, { kind: "review-show" }>),
  "review-status": (c) =>
    runReviewStatus(c as Extract<ParsedCommand, { kind: "review-status" }>),
  serve: () =>
    Effect.fail(
      new CliFailure({
        exitCode: ExitCode.UsageError,
        message:
          "ringi serve is a runtime command. Use it directly, not through the command dispatcher.",
      })
    ),
  "source-diff": (c) =>
    runSourceDiff(c as Extract<ParsedCommand, { kind: "source-diff" }>),
  "source-list": () => runSourceList(),
  "todo-add": () => requireServerMode("ringi todo add"),
  "todo-clear": () => requireServerMode("ringi todo clear"),
  "todo-done": () => requireServerMode("ringi todo done"),
  "todo-list": (c) =>
    runTodoList(c as Extract<ParsedCommand, { kind: "todo-list" }>),
  "todo-move": () => requireServerMode("ringi todo move"),
  "todo-remove": () => requireServerMode("ringi todo remove"),
  "todo-undone": () => requireServerMode("ringi todo undone"),
};

/** Human-readable command label for the JSON envelope `command` field. */
const COMMAND_LABELS: Readonly<Record<string, string>> = {
  "data-migrate": "ringi data migrate",
  "data-reset": "ringi data reset",
  doctor: "ringi doctor",
  events: "ringi events",
  mcp: "ringi mcp",
  "review-create": "ringi review create",
  "review-export": "ringi review export",
  "review-list": "ringi review list",
  "review-pr": "ringi review <pr-url>",
  "review-resolve": "ringi review resolve",
  "review-show": "ringi review show",
  "review-status": "ringi review status",
  serve: "ringi serve",
  "source-diff": "ringi source diff",
  "source-list": "ringi source list",
  "todo-add": "ringi todo add",
  "todo-clear": "ringi todo clear",
  "todo-done": "ringi todo done",
  "todo-list": "ringi todo list",
  "todo-move": "ringi todo move",
  "todo-remove": "ringi todo remove",
  "todo-undone": "ringi todo undone",
};

export const commandLabel = (command: ParsedCommand): string =>
  COMMAND_LABELS[command.kind] ?? `ringi ${command.kind}`;

export const runCommand = (command: ParsedCommand) => {
  const handler = COMMAND_HANDLERS[command.kind];
  if (!handler) {
    return Effect.fail(
      new CliFailure({
        exitCode: ExitCode.UsageError,
        message: `No executable handler exists for ${command.kind}.`,
      })
    );
  }
  return handler(command);
};
