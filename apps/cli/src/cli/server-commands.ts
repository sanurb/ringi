/**
 * Server-connected command handlers.
 *
 * These commands delegate to the running Ringi server over HTTP instead of
 * accessing SQLite directly. This ensures mutations go through the same write
 * path as the web UI and MCP server.
 */
import type { ReviewId, ReviewSourceType } from "@ringi/core/schemas/review";
import * as Effect from "effect/Effect";

import {
  CliFailure,
  ExitCode,
  ServerConnectionError,
  ServerResponseError,
} from "@/cli/cli-errors";
import { CliConfig } from "@/cli/config";
import type { CommandOutput, NextAction } from "@/cli/output";

// ---------------------------------------------------------------------------
// Input types for server command handlers
// (These replace the old ParsedCommand extractions)
// ---------------------------------------------------------------------------

interface ReviewCreateInput {
  readonly source: ReviewSourceType;
  readonly branch?: string;
  readonly commits?: string;
  readonly title?: string;
}

interface ReviewResolveInput {
  readonly id: string;
  readonly allComments: boolean;
  readonly yes: boolean;
}

interface TodoAddInput {
  readonly text: string;
  readonly reviewId?: string;
  readonly position?: number;
}

interface TodoIdInput {
  readonly id: string;
}

interface TodoMoveInput {
  readonly id: string;
  readonly position: number;
}

interface TodoRemoveInput {
  readonly id: string;
  readonly yes: boolean;
}

interface TodoClearInput {
  readonly reviewId?: string;
  readonly all: boolean;
  readonly doneOnly: boolean;
  readonly yes: boolean;
}

interface EventsInput {
  readonly type?: "comments" | "files" | "reviews" | "todos";
  readonly since?: number;
}

interface DataResetInput {
  readonly yes: boolean;
  readonly keepExports: boolean;
}
import {
  checkServerHealth,
  serverDelete,
  serverGet,
  serverPatch,
  serverPost,
  streamSSE,
} from "@/cli/server-client";
import type { ServerClientConfig } from "@/cli/server-client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = "http://localhost:3000";

const makeServerConfig = (): ServerClientConfig => ({
  baseUrl: process.env.RINGI_SERVER_URL ?? DEFAULT_BASE_URL,
});

/** Maps server transport errors to CliFailure. */
const mapServerError = (
  error: ServerConnectionError | ServerResponseError
): CliFailure => {
  if (error._tag === "ServerConnectionError") {
    return new CliFailure({
      details: "Start 'ringi serve' and retry the command.",
      exitCode: ExitCode.RuntimeFailure,
      message: error.message,
    });
  }
  if (error.status === 404) {
    return new CliFailure({
      exitCode: ExitCode.ResourceNotFound,
      message: error.body || error.message,
    });
  }
  return new CliFailure({
    exitCode: ExitCode.RuntimeFailure,
    message: error.message,
  });
};

/** Resolves "last" to the most recent review id via the server. */
const resolveServerReviewId = (
  selector: string
): Effect.Effect<ReviewId, CliFailure> => {
  if (selector !== "last") {
    return Effect.succeed(selector as ReviewId);
  }
  const config = makeServerConfig();
  return serverGet<{ reviews: Array<{ id: string }> }>(
    config,
    "/api/reviews?page=1&pageSize=1"
  ).pipe(
    Effect.mapError(mapServerError),
    Effect.flatMap((result) => {
      const [review] = result.reviews;
      if (!review) {
        return Effect.fail(
          new CliFailure({
            exitCode: ExitCode.ResourceNotFound,
            message: "No review sessions exist for this repository yet.",
          })
        );
      }
      return Effect.succeed(review.id as ReviewId);
    })
  );
};

// ---------------------------------------------------------------------------
// review create
// ---------------------------------------------------------------------------

export const runServerReviewCreate = Effect.fn("CLI.serverReviewCreate")(
  function* (command: ReviewCreateInput) {
    const cliConfig = yield* CliConfig;

    const body: Record<string, unknown> = {
      repositoryPath: cliConfig.repoRoot,
      sourceType: command.source,
    };
    if (command.branch) body.sourceRef = command.branch;
    if (command.commits) body.sourceRef = command.commits;
    if (command.title) body.title = command.title;

    const config = makeServerConfig();
    const review = yield* serverPost<{
      id: string;
      sourceType: string;
      status: string;
      files: Array<{ filePath: string }>;
    }>(config, "/api/reviews", body).pipe(Effect.mapError(mapServerError));

    const nextActions: NextAction[] = [
      {
        command: `ringi review show ${review.id} --comments --todos`,
        description: "Inspect the new review",
      },
      {
        command: `ringi review export ${review.id}`,
        description: "Export the review as markdown",
      },
    ];

    return {
      data: review,
      human: [
        `Created review ${review.id}`,
        `Source: ${review.sourceType}`,
        `Files: ${review.files?.length ?? 0}`,
      ].join("\n"),
      nextActions,
    } satisfies CommandOutput<typeof review>;
  }
);

// ---------------------------------------------------------------------------
// review resolve
// ---------------------------------------------------------------------------

export const runServerReviewResolve = Effect.fn("CLI.serverReviewResolve")(
  function* (command: ReviewResolveInput) {
    const reviewId = yield* resolveServerReviewId(command.id);

    const config = makeServerConfig();

    // Resolve all comments first if requested
    if (command.allComments) {
      const comments = yield* serverGet<
        Array<{ id: string; resolved: boolean }>
      >(config, `/api/reviews/${reviewId}/comments`).pipe(
        Effect.mapError(mapServerError)
      );
      const unresolved = comments.filter((c) => !c.resolved);
      for (const comment of unresolved) {
        yield* serverPost(config, `/api/comments/${comment.id}/resolve`).pipe(
          Effect.mapError(mapServerError)
        );
      }
    }

    // Update review status to approved
    const review = yield* serverPatch<{ id: string; status: string }>(
      config,
      `/api/reviews/${reviewId}`,
      { status: "approved" }
    ).pipe(Effect.mapError(mapServerError));

    const nextActions: NextAction[] = [
      {
        command: `ringi review export ${reviewId}`,
        description: "Export the approved review",
      },
      { command: "ringi review list", description: "Back to review list" },
    ];

    return {
      data: review,
      human: `Review ${reviewId} resolved and approved.`,
      nextActions,
    } satisfies CommandOutput<typeof review>;
  }
);

// ---------------------------------------------------------------------------
// todo add
// ---------------------------------------------------------------------------

export const runServerTodoAdd = Effect.fn("CLI.serverTodoAdd")(function* (
  command: TodoAddInput
) {
  const body: Record<string, unknown> = { content: command.text };
  if (command.reviewId) body.reviewId = command.reviewId;
  if (command.position !== undefined) body.position = command.position;

  const config = makeServerConfig();
  const todo = yield* serverPost<{
    id: string;
    content: string;
    completed: boolean;
  }>(config, "/api/todos", body).pipe(Effect.mapError(mapServerError));

  const nextActions: NextAction[] = [
    { command: "ringi todo list", description: "List todos" },
    {
      command: `ringi todo done ${todo.id}`,
      description: "Mark this todo as done",
    },
  ];

  return {
    data: todo,
    human: `Added todo ${todo.id}: ${todo.content}`,
    nextActions,
  } satisfies CommandOutput<typeof todo>;
});

// ---------------------------------------------------------------------------
// todo done / undone (toggle)
// ---------------------------------------------------------------------------

export const runServerTodoDone = Effect.fn("CLI.serverTodoDone")(function* (
  command: TodoIdInput
) {
  const config = makeServerConfig();
  const todo = yield* serverPatch<{
    id: string;
    content: string;
    completed: boolean;
  }>(config, `/api/todos/${command.id}/toggle`, {}).pipe(
    Effect.mapError(mapServerError)
  );

  return {
    data: todo,
    human: `Todo ${todo.id}: marked as ${todo.completed ? "done" : "pending"}.`,
    nextActions: [{ command: "ringi todo list", description: "List todos" }],
  } satisfies CommandOutput<typeof todo>;
});

export const runServerTodoUndone = Effect.fn("CLI.serverTodoUndone")(function* (
  command: TodoIdInput
) {
  const config = makeServerConfig();
  const todo = yield* serverPatch<{
    id: string;
    content: string;
    completed: boolean;
  }>(config, `/api/todos/${command.id}/toggle`, {}).pipe(
    Effect.mapError(mapServerError)
  );

  return {
    data: todo,
    human: `Todo ${todo.id}: marked as ${todo.completed ? "done" : "pending"}.`,
    nextActions: [{ command: "ringi todo list", description: "List todos" }],
  } satisfies CommandOutput<typeof todo>;
});

// ---------------------------------------------------------------------------
// todo move
// ---------------------------------------------------------------------------

export const runServerTodoMove = Effect.fn("CLI.serverTodoMove")(function* (
  command: TodoMoveInput
) {
  const config = makeServerConfig();
  const todo = yield* serverPatch<{
    id: string;
    content: string;
    position: number;
  }>(config, `/api/todos/${command.id}/move`, {
    position: command.position,
  }).pipe(Effect.mapError(mapServerError));

  return {
    data: todo,
    human: `Moved todo ${todo.id} to position ${command.position}.`,
    nextActions: [{ command: "ringi todo list", description: "List todos" }],
  } satisfies CommandOutput<typeof todo>;
});

// ---------------------------------------------------------------------------
// todo remove
// ---------------------------------------------------------------------------

export const runServerTodoRemove = Effect.fn("CLI.serverTodoRemove")(function* (
  command: TodoRemoveInput
) {
  const config = makeServerConfig();
  const result = yield* serverDelete<{ success: boolean }>(
    config,
    `/api/todos/${command.id}`
  ).pipe(Effect.mapError(mapServerError));

  return {
    data: result,
    human: `Removed todo ${command.id}.`,
    nextActions: [{ command: "ringi todo list", description: "List todos" }],
  } satisfies CommandOutput<typeof result>;
});

// ---------------------------------------------------------------------------
// todo clear
// ---------------------------------------------------------------------------

export const runServerTodoClear = Effect.fn("CLI.serverTodoClear")(function* (
  _command: TodoClearInput
) {
  const config = makeServerConfig();
  const result = yield* serverDelete<{ deleted: number }>(
    config,
    "/api/todos/completed"
  ).pipe(Effect.mapError(mapServerError));

  return {
    data: result,
    human: `Cleared ${result.deleted} completed todo(s).`,
    nextActions: [{ command: "ringi todo list", description: "List todos" }],
  } satisfies CommandOutput<typeof result>;
});

// ---------------------------------------------------------------------------
// events (SSE stream)
// ---------------------------------------------------------------------------

/**
 * `ringi events` — tails the server's SSE event stream.
 *
 * This is a **long-running streaming command**. It connects to the server's
 * SSE endpoint and prints events to stdout as they arrive. Unlike other
 * commands that return a single CommandOutput, this one writes directly to
 * stdout and only returns when the stream ends or the process is interrupted.
 *
 * In `--json` mode, events are emitted as NDJSON (one JSON object per line).
 * In human mode, events are formatted as `[type] timestamp data`.
 */
export const runServerEvents = (
  command: EventsInput,
  options: { json: boolean; quiet: boolean }
): Effect.Effect<CommandOutput<{ streaming: true }>, CliFailure> =>
  Effect.gen(function* () {
    const config = makeServerConfig();

    // Verify server is reachable before opening the stream
    const reachable = yield* checkServerHealth(config);

    if (!reachable) {
      return yield* new CliFailure({
        details: "Start 'ringi serve' and retry the command.",
        exitCode: ExitCode.RuntimeFailure,
        message: `Cannot reach the Ringi server at ${config.baseUrl}. Is 'ringi serve' running?`,
      });
    }

    // Stream events — this runs until interrupted
    yield* Effect.tryPromise({
      catch: (error) =>
        new CliFailure({
          details:
            error instanceof ServerConnectionError
              ? "The SSE connection was lost."
              : undefined,
          exitCode: ExitCode.RuntimeFailure,
          message: error instanceof Error ? error.message : String(error),
        }),
      try: async () => {
        if (!options.quiet) {
          process.stderr.write(
            `Connected to ${config.baseUrl}/api/events${command.type ? ` (filter: ${command.type})` : ""}\n`
          );
        }

        for await (const event of streamSSE(config, {
          type: command.type,
        })) {
          if (options.json) {
            process.stdout.write(`${JSON.stringify(event)}\n`);
          } else {
            const ts = new Date(event.timestamp).toLocaleTimeString();
            const data = event.data ? ` ${JSON.stringify(event.data)}` : "";
            process.stdout.write(`[${event.type}] ${ts}${data}\n`);
          }
        }
      },
    });

    // Stream ended normally (server closed connection)
    return {
      data: { streaming: true as const },
      human: "Event stream ended.",
      nextActions: [
        {
          command: "ringi events",
          description: "Reconnect to the event stream",
        },
        { command: "ringi review list", description: "List reviews" },
      ],
    } satisfies CommandOutput<{ streaming: true }>;
  });

// ---------------------------------------------------------------------------
// data migrate
// ---------------------------------------------------------------------------

export const runServerDataMigrate = Effect.fn("CLI.serverDataMigrate")(
  function* () {
    // data migrate is handled by the server on first startup.
    // When called explicitly, we just verify the server is running and healthy.
    const config = makeServerConfig();
    const reachable = yield* checkServerHealth(config);

    if (!reachable) {
      return yield* new CliFailure({
        details: "Start 'ringi serve' to initialize the database.",
        exitCode: ExitCode.RuntimeFailure,
        message: `Server not reachable at ${config.baseUrl}. The server initializes the database on startup — run 'ringi serve' first.`,
      });
    }

    const data = { migrated: true };
    return {
      data,
      human:
        "Database is initialized. The server applies migrations on startup.",
      nextActions: [
        { command: "ringi review list", description: "List reviews" },
        {
          command: "ringi review status",
          description: "Check repository status",
        },
      ],
    } satisfies CommandOutput<typeof data>;
  }
);

// ---------------------------------------------------------------------------
// data reset
// ---------------------------------------------------------------------------

export const runServerDataReset = Effect.fn("CLI.serverDataReset")(function* (
  _command: DataResetInput
) {
  // data reset is a destructive operation that the server doesn't expose
  // as a REST endpoint yet. For now, provide guidance.
  return yield* new CliFailure({
    details:
      "Stop the server, delete .ringi/reviews.db, and restart 'ringi serve' to reinitialize.",
    exitCode: ExitCode.RuntimeFailure,
    message:
      "ringi data reset is not yet implemented as a server endpoint. Manual reset required.",
  });
});
