import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import * as Effect from "effect/Effect";

import type { ReviewId } from "@/api/schemas/review";
import { CliConfig } from "@/cli/config";
import { CliFailure, ExitCode } from "@/cli/contracts";
import type { CommandOutput, ParsedCommand } from "@/cli/contracts";
import { CommentService } from "@/core/services/comment.service";
import { getDiffSummary, parseDiff } from "@/core/services/diff.service";
import { ExportService } from "@/core/services/export.service";
import { GitService } from "@/core/services/git.service";
import { ReviewService } from "@/core/services/review.service";
import { TodoService } from "@/core/services/todo.service";

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
  git: GitService,
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

  return {
    data: result,
    human: renderReviewList(result.reviews),
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
  return {
    data,
    human: renderReviewShow(data),
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

  return {
    data,
    human: shouldPrintMarkdown
      ? markdown
      : `Exported review ${reviewId} to ${outputPath}.`,
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

  return {
    data,
    human: renderSourceList(data),
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

  return {
    data: result,
    human: renderTodoList(result.data),
  } satisfies CommandOutput<typeof result>;
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
  "review-create": () => requireServerMode("ringi review create"),
  "review-export": (c) =>
    runReviewExport(c as Extract<ParsedCommand, { kind: "review-export" }>),
  "review-list": (c) =>
    runReviewList(c as Extract<ParsedCommand, { kind: "review-list" }>),
  "review-show": (c) =>
    runReviewShow(c as Extract<ParsedCommand, { kind: "review-show" }>),
  "source-diff": (c) =>
    runSourceDiff(c as Extract<ParsedCommand, { kind: "source-diff" }>),
  "source-list": () => runSourceList(),
  "todo-add": () => requireServerMode("ringi todo add"),
  "todo-list": (c) =>
    runTodoList(c as Extract<ParsedCommand, { kind: "todo-list" }>),
};

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
