/**
 * Ringi CLI command definitions using `effect/unstable/cli`.
 *
 * Each command is a typed `Command.make(name, config, handler)` with its flags
 * and arguments declared via `Flag` and `Argument`. The framework handles
 * parsing, help generation, shell completions, and version display.
 *
 * Command handlers produce `CommandOutput<T>` and emit output via the
 * `--json` global flag setting.
 */

import { exec, fork } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { CoreLive } from "@ringi/core/runtime";
import type { ReviewId } from "@ringi/core/schemas/review";
import { CommentService } from "@ringi/core/services/comment.service";
import { CoverageService } from "@ringi/core/services/coverage.service";
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
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { Argument, Command, Flag, GlobalFlag } from "effect/unstable/cli";

import { CliFailure, ExitCode } from "@/cli/cli-errors";
import { CliConfig, CliConfigLive } from "@/cli/config";
import type { CliConfigShape } from "@/cli/config";
import type { CommandOutput, NextAction } from "@/cli/output";
import { successEnvelope, writeJson, writeHuman } from "@/cli/output";

// ---------------------------------------------------------------------------
// Global flag: --json
// ---------------------------------------------------------------------------

const JsonSetting = GlobalFlag.setting("json")({
  flag: Flag.boolean("json").pipe(
    Flag.withDescription("Emit structured JSON envelope to stdout"),
    Flag.withDefault(false)
  ),
});

// Global flag: --quiet
const QuietSetting = GlobalFlag.setting("quiet")({
  flag: Flag.boolean("quiet").pipe(
    Flag.withDescription("Suppress human-readable success output"),
    Flag.withDefault(false)
  ),
});

// Global flag: --repo
const RepoSetting = GlobalFlag.setting("repo")({
  flag: Flag.string("repo").pipe(
    Flag.withDescription("Use a specific Git repository root"),
    Flag.optional
  ),
});

// Global flag: --db-path
const DbPathSetting = GlobalFlag.setting("db-path")({
  flag: Flag.string("db-path").pipe(
    Flag.withDescription("Override the SQLite database path"),
    Flag.optional
  ),
});

// ---------------------------------------------------------------------------
// Output helper: emit result based on --json and --quiet settings
// ---------------------------------------------------------------------------

const emitOutput = <T>(commandLabel: string, output: CommandOutput<T>) =>
  Effect.gen(function* () {
    const jsonMode = yield* JsonSetting;
    const quietMode = yield* QuietSetting;

    if (jsonMode) {
      writeJson(
        successEnvelope(commandLabel, output.data, output.nextActions ?? [])
      );
    } else if (!quietMode) {
      writeHuman(output.human);
    }
  });

// ---------------------------------------------------------------------------
// CLI config layer construction
// ---------------------------------------------------------------------------

import { execFileSync } from "node:child_process";

const resolveRepositoryRoot = (
  repoOverride: Option.Option<string>
): Effect.Effect<string, CliFailure> => {
  const cwd = Option.isSome(repoOverride)
    ? resolve(repoOverride.value)
    : process.cwd();

  try {
    return Effect.succeed(
      execFileSync("git", ["rev-parse", "--show-toplevel"], {
        cwd,
        encoding: "utf8",
      }).trim()
    );
  } catch {
    return Effect.fail(
      new CliFailure({
        exitCode: ExitCode.StateUnavailable,
        message: Option.isSome(repoOverride)
          ? `Path ${cwd} is not a Git repository. Use --repo <path> with a valid repository root.`
          : `Could not resolve a Git repository from ${cwd}. Use --repo <path> with a valid repository root.`,
      })
    );
  }
};

const resolveDbPath = (
  repoRoot: string,
  dbPathOverride: Option.Option<string>
): string =>
  Option.isSome(dbPathOverride)
    ? resolve(dbPathOverride.value)
    : resolve(repoRoot, ".ringi/reviews.db");

const makeCliConfigLayer = Effect.gen(function* () {
  const repoOpt = yield* RepoSetting;
  const dbPathOpt = yield* DbPathSetting;
  const repoRoot = yield* resolveRepositoryRoot(repoOpt);
  const dbPath = resolveDbPath(repoRoot, dbPathOpt);

  const config: CliConfigShape = {
    color: true,
    cwd: process.cwd(),
    dbPath,
    outputMode: "human",
    quiet: false,
    repoRoot,
    verbose: false,
  };

  return Layer.mergeAll(
    CliConfigLive(config),
    ConfigProvider.layer(
      ConfigProvider.fromUnknown({
        DB_PATH: dbPath,
        REPOSITORY_PATH: repoRoot,
      })
    )
  );
});

const ensureDatabaseExists = Effect.gen(function* () {
  const cliConfig = yield* CliConfig;
  if (!existsSync(cliConfig.dbPath)) {
    yield* new CliFailure({
      exitCode: ExitCode.StateUnavailable,
      message: `Local state is missing at ${cliConfig.dbPath}. Run 'ringi data migrate' or start 'ringi serve' once to initialize local state.`,
    });
  }
});

/**
 * Provides CoreLive + CliConfig to a command's handler.
 * Constructs the layer from the global flags (--repo, --db-path).
 */
const provideCoreLayer = <Name extends string, Input, CI, E, R>(
  self: Command.Command<Name, Input, CI, E, R>
): Command.Command<
  Name,
  Input,
  CI,
  E | CliFailure,
  Exclude<
    R,
    | CliConfig
    | ReviewService
    | CommentService
    | TodoService
    | GitService
    | ExportService
    | typeof import("@ringi/core/services/event.service").EventService
    | typeof import("@ringi/core/services/gh.service").GhService
  >
> =>
  Command.provide(self, () =>
    Layer.unwrap(
      makeCliConfigLayer.pipe(
        Effect.map((configLayer) =>
          Layer.mergeAll(CoreLive, configLayer).pipe(
            Layer.provideMerge(configLayer)
          )
        )
      )
    )
  ) as any;

/**
 * Provides only GitService + CliConfig (lighter for git-only commands).
 */
const provideGitLayer = <Name extends string, Input, CI, E, R>(
  self: Command.Command<Name, Input, CI, E, R>
) =>
  Command.provide(self, () =>
    Layer.unwrap(
      makeCliConfigLayer.pipe(
        Effect.map((configLayer) =>
          Layer.mergeAll(GitService.Default, configLayer).pipe(
            Layer.provideMerge(configLayer)
          )
        )
      )
    )
  ) as any;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const resolveReviewSelector = Effect.fn("CLI.resolveReviewSelector")(function* (
  selector: string
) {
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
});

const requireServerMode = (label: string) =>
  Effect.fail(
    new CliFailure({
      details: "Start 'ringi serve' and retry the command.",
      exitCode: ExitCode.StateUnavailable,
      message: `${label} requires a running local Ringi server. Standalone local writes are intentionally unsupported.`,
    })
  );

// ---------------------------------------------------------------------------
// Renderers (pure functions)
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

// ---------------------------------------------------------------------------
// review list
// ---------------------------------------------------------------------------

const reviewList = Command.make(
  "list",
  {
    status: Flag.choice("status", [
      "in_progress",
      "approved",
      "changes_requested",
    ]).pipe(Flag.withDescription("Filter by review status"), Flag.optional),
    source: Flag.choice("source", [
      "staged",
      "branch",
      "commits",
      "pull_request",
    ]).pipe(Flag.withDescription("Filter by source type"), Flag.optional),
    limit: Flag.integer("limit").pipe(
      Flag.withDefault(20),
      Flag.withDescription("Number of results per page")
    ),
    page: Flag.integer("page").pipe(
      Flag.withDefault(1),
      Flag.withDescription("Page number")
    ),
  },
  (config) =>
    Effect.gen(function* () {
      yield* ensureDatabaseExists;
      const reviewService = yield* ReviewService;
      const cliConfig = yield* CliConfig;
      const result = yield* reviewService.list({
        page: config.page,
        pageSize: config.limit,
        repositoryPath: cliConfig.repoRoot,
        sourceType: Option.getOrUndefined(config.source),
        status: Option.getOrUndefined(config.status),
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
          command: "ringi review show <id> --comments --todos",
          description: "Show full review details",
        });
      }
      nextActions.push({
        command: "ringi review create --source <source>",
        description: "Create a new review session",
      });

      yield* emitOutput("ringi review list", {
        data: result,
        human:
          result.reviews.length === 0
            ? "No reviews found."
            : formatTable(
                ["ID", "STATUS", "SOURCE", "FILES", "CREATED"],
                result.reviews.map((r: any) => [
                  r.id,
                  r.status,
                  r.sourceType,
                  String(r.fileCount),
                  r.createdAt,
                ])
              ),
        nextActions,
      });
    })
).pipe(Command.withDescription("List review sessions"));

// ---------------------------------------------------------------------------
// review show
// ---------------------------------------------------------------------------

const reviewShow = Command.make(
  "show",
  {
    id: Argument.string("id"),
    comments: Flag.boolean("comments").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Include comments")
    ),
    todos: Flag.boolean("todos").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Include todos")
    ),
  },
  (config) =>
    Effect.gen(function* () {
      yield* ensureDatabaseExists;
      const reviewService = yield* ReviewService;
      const todoService = yield* TodoService;
      const commentService = yield* CommentService;
      const reviewId = yield* resolveReviewSelector(config.id);
      const review = yield* reviewService.getById(reviewId);
      const comments = config.comments
        ? yield* commentService.getByReview(reviewId)
        : undefined;
      const todos = config.todos
        ? (yield* todoService.list({ reviewId })).data
        : undefined;

      const data = { comments, review, todos };
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

      yield* emitOutput("ringi review show", {
        data,
        human: lines.join("\n"),
        nextActions: [
          {
            command: `ringi review export ${reviewId}`,
            description: "Export this review as markdown",
          },
          {
            command: `ringi review show ${reviewId} --comments --todos`,
            description: "Show with comments and todos",
          },
          {
            command: "ringi review list",
            description: "Back to review list",
          },
        ],
      });
    })
).pipe(Command.withDescription("Show review details"));

// ---------------------------------------------------------------------------
// review export
// ---------------------------------------------------------------------------

const reviewExport = Command.make(
  "export",
  {
    id: Argument.string("id"),
    output: Flag.string("output").pipe(
      Flag.withDescription("Output file path"),
      Flag.optional
    ),
    stdout: Flag.boolean("stdout").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Print to stdout instead of a file")
    ),
  },
  (config) =>
    Effect.gen(function* () {
      yield* ensureDatabaseExists;
      const exportService = yield* ExportService;
      const cliConfig = yield* CliConfig;
      const reviewId = yield* resolveReviewSelector(config.id);
      const markdown = yield* exportService.exportReview(reviewId);
      const outputPath = Option.isSome(config.output)
        ? resolve(cliConfig.cwd, config.output.value)
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

      const shouldPrintMarkdown = config.stdout || !outputPath;
      const data = { markdown, outputPath: outputPath ?? null, reviewId };

      yield* emitOutput("ringi review export", {
        data,
        human: shouldPrintMarkdown
          ? markdown
          : `Exported review ${reviewId} to ${outputPath}.`,
        nextActions: [
          {
            command: `ringi review show ${reviewId}`,
            description: "View the exported review",
          },
          {
            command: "ringi review list",
            description: "Back to review list",
          },
        ],
      });
    })
).pipe(Command.withDescription("Export review as markdown"));

// ---------------------------------------------------------------------------
// review create
// ---------------------------------------------------------------------------

const reviewCreate = Command.make(
  "create",
  {
    source: Flag.choice("source", [
      "staged",
      "branch",
      "commits",
      "pull_request",
    ]).pipe(
      Flag.withDefault("staged" as const),
      Flag.withDescription("Review source type")
    ),
    branch: Flag.string("branch").pipe(
      Flag.withDescription("Branch name for branch source"),
      Flag.optional
    ),
    commits: Flag.string("commits").pipe(
      Flag.withDescription("Commit range for commits source"),
      Flag.optional
    ),
    title: Flag.string("title").pipe(
      Flag.withDescription("Review title"),
      Flag.optional
    ),
  },
  (_config) => requireServerMode("ringi review create")
).pipe(Command.withDescription("Create a review session"));

// ---------------------------------------------------------------------------
// review resolve
// ---------------------------------------------------------------------------

const reviewResolve = Command.make(
  "resolve",
  {
    id: Argument.string("id"),
    allComments: Flag.boolean("all-comments").pipe(
      Flag.withDefault(true),
      Flag.withDescription("Resolve all comments")
    ),
    yes: Flag.boolean("yes").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Skip confirmation prompt")
    ),
  },
  (_config) => requireServerMode("ringi review resolve")
).pipe(Command.withDescription("Resolve a review session"));

// ---------------------------------------------------------------------------
// review status
// ---------------------------------------------------------------------------

const reviewStatus = Command.make(
  "status",
  {
    reviewId: Flag.string("review").pipe(
      Flag.withDescription("Review ID or 'last'"),
      Flag.optional
    ),
    source: Flag.choice("source", [
      "staged",
      "branch",
      "commits",
      "pull_request",
    ]).pipe(Flag.withDescription("Filter by source type"), Flag.optional),
  },
  (config) =>
    Effect.gen(function* () {
      yield* ensureDatabaseExists;
      const reviewService = yield* ReviewService;
      const todoService = yield* TodoService;
      const commentService = yield* CommentService;
      const gitService = yield* GitService;
      const cliConfig = yield* CliConfig;

      const repo = yield* gitService.getRepositoryInfo;
      const stagedFiles = yield* gitService.getStagedFiles;

      let reviewId: string | undefined;
      if (Option.isSome(config.reviewId)) {
        reviewId = yield* resolveReviewSelector(config.reviewId.value);
      }

      const reviews = yield* reviewService.list({
        page: 1,
        pageSize: 1,
        repositoryPath: cliConfig.repoRoot,
        sourceType: Option.getOrUndefined(config.source),
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
        command: "ringi review create --source <source>",
        description: "Create a new review session",
      });

      yield* emitOutput("ringi review status", {
        data,
        human: lines.join("\n"),
        nextActions,
      });
    })
).pipe(Command.withDescription("Show repository and review status"));

// ---------------------------------------------------------------------------
// review pr (URL shortcut)
// ---------------------------------------------------------------------------

const reviewPr = Command.make(
  "pr",
  {
    prUrl: Argument.string("pr-url"),
    port: Flag.integer("port").pipe(
      Flag.withDefault(3000),
      Flag.withDescription("Local server port")
    ),
    noOpen: Flag.boolean("no-open").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Skip opening the browser")
    ),
    forceRefresh: Flag.boolean("force-refresh").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Re-fetch PR data with latest changes")
    ),
  },
  (config) =>
    Effect.gen(function* () {
      const target = yield* parsePrUrl(config.prUrl).pipe(
        Effect.mapError(
          (e) =>
            new CliFailure({
              exitCode: ExitCode.UsageError,
              message: e.message,
            })
        )
      );

      const preflight = yield* runPreflight(target).pipe(
        Effect.mapError(
          (e) =>
            new CliFailure({
              exitCode: (e as any).exitCode ?? ExitCode.RuntimeFailure,
              message: e.message,
            })
        )
      );

      if (preflight.affinityWarning) {
        yield* Effect.logWarning(preflight.affinityWarning);
      }

      let session: {
        isResumed: boolean;
        isStale: boolean;
        reviewId: ReviewId;
        staleWarning: string | null;
      };

      if (config.forceRefresh) {
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

      const serverUrl = `http://localhost:${config.port}`;
      const reviewUrl = `${serverUrl}/review/${session.reviewId}`;
      const statusLabel = session.isResumed
        ? config.forceRefresh
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

      const data = {
        isResumed: session.isResumed,
        isStale: session.isStale,
        prNumber: target.prNumber,
        prUrl: target.url,
        reviewId: session.reviewId,
        reviewUrl,
      };

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

      yield* emitOutput("ringi review pr", {
        data,
        human: humanLines.join("\n"),
        nextActions,
      });
    })
).pipe(Command.withDescription("Create or resume a PR review"));

// ---------------------------------------------------------------------------
// review (parent command)
// ---------------------------------------------------------------------------

const review = Command.make("review").pipe(
  Command.withDescription("Review management commands"),
  Command.withSubcommands([
    reviewList,
    reviewShow,
    reviewExport,
    reviewCreate,
    reviewResolve,
    reviewStatus,
    reviewPr,
  ])
);

// ---------------------------------------------------------------------------
// source list
// ---------------------------------------------------------------------------

const sourceList = Command.make("list", {}, () =>
  Effect.gen(function* () {
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

    const lines = [
      `Repository: ${data.repo.name}`,
      `Path: ${data.repo.path}`,
      `Current branch: ${data.repo.branch}`,
      `Staged files: ${data.stagedFiles.length}`,
    ];

    if (data.stagedFiles.length > 0) {
      lines.push("", "Staged:");
      for (const file of data.stagedFiles) {
        lines.push(`- ${file.status} ${file.path}`);
      }
    }

    if (data.branches.length > 0) {
      lines.push("", "Branches:");
      for (const branch of data.branches.slice(0, 10)) {
        lines.push(`- ${branch.current ? "*" : " "} ${branch.name}`);
      }
    }

    if (data.commits.length > 0) {
      lines.push("", "Recent commits:");
      for (const commit of data.commits.slice(0, 5)) {
        lines.push(
          `- ${commit.hash.slice(0, 8)} ${commit.message} (${commit.author})`
        );
      }
    }

    yield* emitOutput("ringi source list", {
      data,
      human: lines.join("\n"),
      nextActions: [
        {
          command: "ringi source diff <source> --stat",
          description: "View diff for a source",
        },
        {
          command: "ringi review create --source <source>",
          description: "Create a review from a source",
        },
        {
          command: "ringi review list",
          description: "List existing reviews",
        },
      ],
    });
  })
).pipe(Command.withDescription("List repository sources"));

// ---------------------------------------------------------------------------
// source diff
// ---------------------------------------------------------------------------

type DiffSourceStrategy = (
  git: GitService["Service"],
  branch?: string,
  commits?: string
) => Effect.Effect<string, unknown>;

const diffStrategies: Readonly<Record<string, DiffSourceStrategy>> = {
  branch: (git, branch) => git.getBranchDiff(branch ?? ""),
  commits: (git, _branch, commits) =>
    git.getCommitDiff(
      (commits ?? "")
        .split(",")
        .map((i) => i.trim())
        .filter(Boolean)
    ),
  staged: (git) => git.getStagedDiff,
};

const sourceDiff = Command.make(
  "diff",
  {
    source: Argument.choice("source", ["staged", "branch", "commits"] as const),
    branch: Flag.string("branch").pipe(
      Flag.withDescription("Branch name"),
      Flag.optional
    ),
    commits: Flag.string("commits").pipe(
      Flag.withDescription("Commit range"),
      Flag.optional
    ),
    stat: Flag.boolean("stat").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Show stats only")
    ),
  },
  (config) =>
    Effect.gen(function* () {
      const gitService = yield* GitService;
      const strategy = diffStrategies[config.source];

      if (!strategy) {
        yield* new CliFailure({
          exitCode: ExitCode.UsageError,
          message: "Unsupported review source.",
        });
      }

      const diffText = yield* strategy!(
        gitService,
        Option.getOrUndefined(config.branch),
        Option.getOrUndefined(config.commits)
      );

      if (!diffText.trim()) {
        yield* new CliFailure({
          exitCode: ExitCode.RuntimeFailure,
          message: "No diff available for the requested source.",
        });
      }

      const files = parseDiff(diffText);
      const data = {
        diff: diffText,
        source: config.source,
        summary: getDiffSummary(files),
      };

      yield* emitOutput("ringi source diff", {
        data,
        human: config.stat
          ? [
              `Source: ${config.source}`,
              `Files: ${data.summary.totalFiles}`,
              `Additions: ${data.summary.totalAdditions}`,
              `Deletions: ${data.summary.totalDeletions}`,
            ].join("\n")
          : diffText,
        nextActions: [
          {
            command: `ringi review create --source ${config.source}`,
            description: `Create a review from this ${config.source} diff`,
          },
          {
            command: "ringi source list",
            description: "List repository sources",
          },
        ],
      });
    })
).pipe(Command.withDescription("Show diff for a source"));

// ---------------------------------------------------------------------------
// source (parent)
// ---------------------------------------------------------------------------

const source = Command.make("source").pipe(
  Command.withDescription("Source management commands"),
  Command.withSubcommands([sourceList, sourceDiff])
);

// ---------------------------------------------------------------------------
// todo list
// ---------------------------------------------------------------------------

const todoList = Command.make(
  "list",
  {
    reviewId: Flag.string("review").pipe(
      Flag.withDescription("Filter by review ID"),
      Flag.optional
    ),
    status: Flag.choice("status", ["pending", "done", "all"] as const).pipe(
      Flag.withDefault("pending" as const),
      Flag.withDescription("Filter by status")
    ),
    limit: Flag.integer("limit").pipe(
      Flag.withDescription("Max results"),
      Flag.optional
    ),
    offset: Flag.integer("offset").pipe(
      Flag.withDefault(0),
      Flag.withDescription("Results offset")
    ),
  },
  (config) =>
    Effect.gen(function* () {
      yield* ensureDatabaseExists;
      const todoService = yield* TodoService;
      const result = yield* todoService.list({
        completed:
          config.status === "all" ? undefined : config.status === "done",
        limit: Option.getOrUndefined(config.limit),
        offset: config.offset,
        reviewId: Option.getOrUndefined(config.reviewId),
      });

      const nextActions: NextAction[] = [];
      if (Option.isSome(config.reviewId)) {
        nextActions.push({
          command: `ringi review show ${config.reviewId.value}`,
          description: "View the associated review",
        });
      }
      nextActions.push(
        {
          command: "ringi todo add --text <text>",
          description: "Add a new todo",
        },
        {
          command: "ringi review list",
          description: "List reviews",
        }
      );

      yield* emitOutput("ringi todo list", {
        data: result,
        human:
          result.data.length === 0
            ? "No todos found."
            : result.data
                .map(
                  (todo: any) =>
                    `- [${todo.completed ? "x" : " "}] (${todo.position + 1}) ${todo.content}`
                )
                .join("\n"),
        nextActions,
      });
    })
).pipe(Command.withDescription("List todo items"));

// ---------------------------------------------------------------------------
// todo add / done / undone / move / remove / clear
// ---------------------------------------------------------------------------

const todoAdd = Command.make(
  "add",
  {
    text: Flag.string("text").pipe(Flag.withDescription("Todo text")),
    reviewId: Flag.string("review").pipe(
      Flag.withDescription("Associate with review"),
      Flag.optional
    ),
    position: Flag.integer("position").pipe(
      Flag.withDescription("Insert position"),
      Flag.optional
    ),
  },
  (_config) => requireServerMode("ringi todo add")
).pipe(Command.withDescription("Add a todo item"));

const todoDone = Command.make(
  "done",
  { id: Argument.string("id") },
  (_config) => requireServerMode("ringi todo done")
).pipe(Command.withDescription("Mark a todo as done"));

const todoUndone = Command.make(
  "undone",
  { id: Argument.string("id") },
  (_config) => requireServerMode("ringi todo undone")
).pipe(Command.withDescription("Reopen a completed todo"));

const todoMove = Command.make(
  "move",
  {
    id: Argument.string("id"),
    position: Flag.integer("position").pipe(
      Flag.withDescription("Target position")
    ),
  },
  (_config) => requireServerMode("ringi todo move")
).pipe(Command.withDescription("Move a todo to a position"));

const todoRemove = Command.make(
  "remove",
  {
    id: Argument.string("id"),
    yes: Flag.boolean("yes").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Skip confirmation")
    ),
  },
  (_config) => requireServerMode("ringi todo remove")
).pipe(Command.withDescription("Remove a todo"));

const todoClear = Command.make(
  "clear",
  {
    reviewId: Flag.string("review").pipe(
      Flag.withDescription("Scope to review"),
      Flag.optional
    ),
    doneOnly: Flag.boolean("done-only").pipe(
      Flag.withDefault(true),
      Flag.withDescription("Clear only completed")
    ),
    all: Flag.boolean("all").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Clear all todos")
    ),
    yes: Flag.boolean("yes").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Skip confirmation")
    ),
  },
  (_config) => requireServerMode("ringi todo clear")
).pipe(Command.withDescription("Clear completed todos"));

// ---------------------------------------------------------------------------
// todo (parent)
// ---------------------------------------------------------------------------

const todo = Command.make("todo").pipe(
  Command.withDescription("Todo management commands"),
  Command.withSubcommands([
    todoList,
    todoAdd,
    todoDone,
    todoUndone,
    todoMove,
    todoRemove,
    todoClear,
  ])
);

// ---------------------------------------------------------------------------
// serve (long-running, forks the Nitro server)
// ---------------------------------------------------------------------------

const resolveServerEntry = (): string | undefined => {
  const candidates: string[] = [];

  if (import.meta.dirname) {
    const pkgRoot = resolve(import.meta.dirname, "..");
    candidates.push(resolve(pkgRoot, "server", "server", "index.mjs"));
    candidates.push(
      resolve(pkgRoot, "..", "web", ".output", "server", "index.mjs")
    );
  }

  candidates.push(resolve(process.cwd(), ".output", "server", "index.mjs"));

  return candidates.find((candidate) => existsSync(candidate));
};

const serve = Command.make(
  "serve",
  {
    host: Flag.string("host").pipe(
      Flag.withDefault("127.0.0.1"),
      Flag.withDescription("Bind host")
    ),
    port: Flag.integer("port").pipe(
      Flag.withDefault(3000),
      Flag.withDescription("Port number")
    ),
    https: Flag.boolean("https").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Enable HTTPS")
    ),
    cert: Flag.string("cert").pipe(
      Flag.withDescription("SSL certificate path"),
      Flag.optional
    ),
    key: Flag.string("key").pipe(
      Flag.withDescription("SSL key path"),
      Flag.optional
    ),
    auth: Flag.boolean("auth").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Enable authentication")
    ),
    noOpen: Flag.boolean("no-open").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Don't open browser")
    ),
  },
  (config) =>
    Effect.callback<void, CliFailure>((resume) => {
      const serverEntry = resolveServerEntry();

      if (!serverEntry) {
        const isInstalledGlobally =
          import.meta.dirname && !import.meta.dirname.includes("apps/cli/");
        const hint = isInstalledGlobally
          ? "The installed package is missing its server assets. Try reinstalling: npm install -g @sanurb/ringi"
          : "Run 'pnpm build' at the monorepo root, then 'pnpm --filter @sanurb/ringi build:server' to copy the server assets.";
        resume(
          Effect.fail(
            new CliFailure({
              exitCode: ExitCode.RuntimeFailure,
              message: `No built server found.\n${hint}`,
            })
          )
        );
        return;
      }

      const env: Record<string, string> = {
        ...process.env,
        NITRO_HOST: config.host,
        NITRO_PORT: String(config.port),
      };

      if (
        config.https &&
        Option.isSome(config.cert) &&
        Option.isSome(config.key)
      ) {
        env.NITRO_SSL_CERT = config.cert.value;
        env.NITRO_SSL_KEY = config.key.value;
      }

      const protocol = config.https ? "https" : "http";
      const url = `${protocol}://${config.host === "0.0.0.0" ? "localhost" : config.host}:${config.port}`;
      process.stderr.write(`ringi server starting on ${url}\n`);

      const child = fork(serverEntry, [], {
        env,
        execArgv: [],
        stdio: "inherit",
      });

      if (!config.noOpen) {
        setTimeout(() => {
          let openCmd = "xdg-open";
          if (process.platform === "darwin") {
            openCmd = "open";
          } else if (process.platform === "win32") {
            openCmd = "start";
          }
          exec(`${openCmd} ${url}`, () => {});
        }, 1500);
      }

      const shutdown = () => child.kill("SIGTERM");
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);

      child.on("exit", (code) => {
        process.off("SIGINT", shutdown);
        process.off("SIGTERM", shutdown);
        if (code === 0) {
          resume(Effect.void);
        } else {
          resume(
            Effect.fail(
              new CliFailure({
                exitCode: ExitCode.RuntimeFailure,
                message: `Server exited with code ${code}`,
              })
            )
          );
        }
      });
    })
).pipe(Command.withDescription("Start the local Ringi server"));

// ---------------------------------------------------------------------------
// mcp
// ---------------------------------------------------------------------------

const mcp = Command.make(
  "mcp",
  {
    readonly: Flag.boolean("readonly").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Read-only mode")
    ),
    logLevel: Flag.choice("log-level", [
      "debug",
      "info",
      "error",
      "silent",
    ] as const).pipe(
      Flag.withDefault("error" as const),
      Flag.withDescription("MCP log level")
    ),
  },
  (_config) =>
    Effect.fail(
      new CliFailure({
        exitCode: ExitCode.UsageError,
        message:
          "ringi mcp is a runtime command. Use the MCP server entry point directly.",
      })
    )
).pipe(Command.withDescription("Start the MCP stdio server"));

// ---------------------------------------------------------------------------
// coverage
// ---------------------------------------------------------------------------

const coverageCmd = Command.make(
  "coverage",
  {
    id: Argument.string("id"),
    files: Flag.boolean("files").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Show per-file breakdown")
    ),
  },
  (config) =>
    Effect.gen(function* () {
      yield* ensureDatabaseExists;
      const coverageService = yield* CoverageService;
      const reviewService = yield* ReviewService;
      const reviewId = yield* resolveReviewSelector(config.id);

      // Validate review exists
      const review = yield* reviewService.getById(reviewId);
      const summary = yield* coverageService.getSummary(reviewId);

      const pct = (n: number) =>
        summary.totalHunks > 0
          ? `${Math.round((n / summary.totalHunks) * 100)}%`
          : "0%";

      const data: Record<string, unknown> = {
        reviewId: review.id,
        summary,
      };

      const lines = [
        `Review ${review.id} coverage:`,
        `  Total hunks:      ${String(summary.totalHunks).padStart(4)}`,
        `  Reviewed:         ${String(summary.reviewedHunks).padStart(4)}  (${pct(summary.reviewedHunks)})`,
        `  Partial:          ${String(summary.partialHunks).padStart(4)}  (${pct(summary.partialHunks)})`,
        `  Unreviewed:       ${String(summary.unreviewedHunks).padStart(4)}  (${pct(summary.unreviewedHunks)})`,
      ];

      if (config.files) {
        // Get per-file hunk counts from the review
        // We reuse the review files data from getById
        lines.push("");
        for (const file of review.files) {
          const fileHunks = yield* reviewService.getFileHunks(
            reviewId,
            file.filePath
          );
          const totalFileHunks = fileHunks.length;
          // Simple dots visualization
          const dots = fileHunks.map(() => "○").join("");
          lines.push(
            `${file.filePath.padEnd(40)} ${totalFileHunks} hunks  ${dots}`
          );
        }
      }

      yield* emitOutput("ringi coverage", {
        data,
        human: lines.join("\n"),
        nextActions: [
          {
            command: `ringi review show ${reviewId}`,
            description: "View review details",
          },
          {
            command: `ringi coverage ${reviewId} --files`,
            description: "Show per-file coverage breakdown",
          },
        ],
      });
    })
).pipe(Command.withDescription("Show review coverage summary"));

// ---------------------------------------------------------------------------
// doctor
// ---------------------------------------------------------------------------

const doctor = Command.make("doctor", {}, () =>
  Effect.gen(function* () {
    yield* emitOutput("ringi doctor", {
      data: { checks: [], ok: true },
      human: "ringi doctor: not yet implemented.",
      nextActions: [],
    });
  })
).pipe(Command.withDescription("Run local diagnostics"));

// ---------------------------------------------------------------------------
// events
// ---------------------------------------------------------------------------

const events = Command.make(
  "events",
  {
    type: Flag.choice("type", [
      "reviews",
      "comments",
      "todos",
      "files",
    ] as const).pipe(Flag.withDescription("Filter event type"), Flag.optional),
  },
  (_config) => requireServerMode("ringi events")
).pipe(Command.withDescription("Tail server events"));

// ---------------------------------------------------------------------------
// data migrate / reset
// ---------------------------------------------------------------------------

const dataMigrate = Command.make("migrate", {}, () =>
  requireServerMode("ringi data migrate")
).pipe(Command.withDescription("Run database migrations"));

const dataReset = Command.make(
  "reset",
  {
    yes: Flag.boolean("yes").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Skip confirmation")
    ),
    keepExports: Flag.boolean("keep-exports").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Preserve export files")
    ),
  },
  (_config) => requireServerMode("ringi data reset")
).pipe(Command.withDescription("Reset local data"));

const data = Command.make("data").pipe(
  Command.withDescription("Data management commands"),
  Command.withSubcommands([dataMigrate, dataReset])
);

// ---------------------------------------------------------------------------
// Root command
// ---------------------------------------------------------------------------

// Commands that need core services get them provided
const reviewWithCore = provideCoreLayer(review) as any;
const sourceWithGit = provideGitLayer(source) as any;
const todoWithCore = provideCoreLayer(todo) as any;
const coverageWithCore = provideCoreLayer(coverageCmd) as any;
const doctorWithCore = provideCoreLayer(doctor) as any;

export const ringiCommand = Command.make("ringi").pipe(
  Command.withDescription("ringi — local-first code review CLI"),
  Command.withGlobalFlags([
    JsonSetting,
    QuietSetting,
    RepoSetting,
    DbPathSetting,
  ]),
  Command.withSubcommands([
    reviewWithCore,
    sourceWithGit,
    todoWithCore,
    coverageWithCore,
    serve,
    mcp,
    doctorWithCore,
    events,
    data,
  ])
);
