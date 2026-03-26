import * as vm from "node:vm";

import type { ReviewId } from "@ringi/core/schemas/review";
import type {
  CreateTodoInput as CoreCreateTodoInput,
  TodoId,
} from "@ringi/core/schemas/todo";
import { CommentService } from "@ringi/core/services/comment.service";
import { ExportService } from "@ringi/core/services/export.service";
import { GitService } from "@ringi/core/services/git.service";
import { ReviewService } from "@ringi/core/services/review.service";
import { TodoService } from "@ringi/core/services/todo.service";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as ParseResult from "effect/ParseResult";
import * as Schema from "effect/Schema";

import type { McpConfigShape } from "@/mcp/config";
import {
  ExecutionTimeoutError,
  InvalidCodeError,
  InvalidTimeoutError,
  SandboxExecutionError,
} from "@/mcp/errors";
import type { McpManagedRuntime, McpRuntimeContext } from "@/mcp/runtime";
import type { SandboxDeps } from "@/mcp/sandbox";
import { createSandboxGlobals } from "@/mcp/sandbox";
import {
  decodeCreateTodoInput,
  decodeReviewCreateInput,
  ReviewDiffQuery,
  ReviewExportInput,
  ReviewListFilters,
  TodoListFilter,
  TodoMoveInput,
} from "@/mcp/schemas";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_CODE_LENGTH = 50_000;
const MIN_PREVIEW_BYTES = 256;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ExecuteInput {
  readonly code: string;
  readonly timeout?: number;
}

export interface ExecuteOutput {
  readonly error?: string;
  readonly ok: boolean;
  readonly result: unknown;
  readonly truncated?: boolean;
}

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

interface OperationJournalEntry {
  readonly error?: string;
  readonly name: string;
  readonly ok: boolean;
  readonly result?: unknown;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

export const clampTimeout = (
  requestedTimeout: number | undefined,
  config: Pick<McpConfigShape, "defaultTimeoutMs" | "maxTimeoutMs">
): number => {
  if (requestedTimeout === undefined) {
    return config.defaultTimeoutMs;
  }
  if (!Number.isFinite(requestedTimeout) || requestedTimeout <= 0) {
    throw new Error(
      `Invalid timeout: expected a positive integer, received ${requestedTimeout}`
    );
  }
  return Math.min(Math.trunc(requestedTimeout), config.maxTimeoutMs);
};

const formatError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const truncateUtf8 = (text: string, maxBytes: number): string => {
  const buffer = Buffer.from(text, "utf8");
  if (buffer.byteLength <= maxBytes) {
    return text;
  }
  return buffer.subarray(0, maxBytes).toString("utf8");
};

const summarizeForJournal = (value: unknown): unknown => {
  if (typeof value === "string") {
    return value.length > 200 ? `${value.slice(0, 200)}…` : value;
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null ||
    value === undefined
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return { kind: "array", length: value.length };
  }
  if (typeof value === "object") {
    return {
      keys: Object.keys(value as Record<string, unknown>).slice(0, 10),
      kind: "object",
    };
  }
  return typeof value;
};

export const finalizeOutput = (
  output: ExecuteOutput,
  maxOutputBytes: number
): ExecuteOutput => {
  const serialized = JSON.stringify(output);
  if (Buffer.byteLength(serialized, "utf8") <= maxOutputBytes) {
    return output;
  }
  const previewBudget = Math.max(
    MIN_PREVIEW_BYTES,
    maxOutputBytes - Math.min(1024, Math.floor(maxOutputBytes / 4))
  );
  return {
    ...output,
    result: {
      note: "Result truncated to fit MCP output budget",
      preview: truncateUtf8(JSON.stringify(output.result), previewBudget),
    },
    truncated: true,
  };
};

export const ensureCode = (code: unknown): string => {
  if (typeof code !== "string") {
    throw new TypeError("Invalid code: expected a string");
  }
  const trimmed = code.trim();
  if (trimmed.length === 0) {
    throw new Error("Invalid code: expected a non-empty string");
  }
  if (trimmed.length > MAX_CODE_LENGTH) {
    throw new Error(
      `Invalid code: maximum length is ${MAX_CODE_LENGTH} characters`
    );
  }
  return trimmed;
};

// ---------------------------------------------------------------------------
// Schema-based decoding helper
// ---------------------------------------------------------------------------

/** Synchronous decode — throws on failure (for use inside Promise-returning sandbox callbacks). */
const decodeInputSync = <A, I>(
  schema: Schema.Schema<A, I>,
  input: unknown,
  operation: string
): A => {
  try {
    return Schema.decodeUnknownSync(schema)(input);
  } catch (error) {
    if (error instanceof ParseResult.ParseError) {
      throw new TypeError(
        `${operation}: ${ParseResult.TreeFormatter.formatErrorSync(error)}`,
        { cause: error }
      );
    }
    throw error;
  }
};

// ---------------------------------------------------------------------------
// Effect-based validation
// ---------------------------------------------------------------------------

const validateCode = (code: unknown): Effect.Effect<string, InvalidCodeError> =>
  Effect.try({
    catch: (e) => new InvalidCodeError({ message: formatError(e) }),
    try: () => ensureCode(code),
  });

const validateTimeout = (
  requested: number | undefined,
  config: Pick<McpConfigShape, "defaultTimeoutMs" | "maxTimeoutMs">
): Effect.Effect<number, InvalidTimeoutError> =>
  Effect.try({
    catch: () =>
      new InvalidTimeoutError({
        message: `Invalid timeout: expected a positive integer, received ${requested}`,
        received: requested,
      }),
    try: () => clampTimeout(requested, config),
  });

// ---------------------------------------------------------------------------
// Sandbox console
// ---------------------------------------------------------------------------

const writeSandboxLog = (level: string, args: readonly unknown[]): void => {
  const line = args
    .map((arg) => {
      if (typeof arg === "string") {
        return arg;
      }
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");
  process.stderr.write(`[ringi:mcp:${level}] ${line}\n`);
};

const createSandboxConsole = () =>
  Object.freeze({
    error: (...args: readonly unknown[]) => writeSandboxLog("error", args),
    info: (...args: readonly unknown[]) => writeSandboxLog("info", args),
    log: (...args: readonly unknown[]) => writeSandboxLog("log", args),
    warn: (...args: readonly unknown[]) => writeSandboxLog("warn", args),
  });

// ---------------------------------------------------------------------------
// VM sandbox runner (Effect-based, single timeout via fiber interruption)
// ---------------------------------------------------------------------------

/**
 * Runs user code in a VM sandbox with a single, deterministic timeout model:
 *
 * 1. `vm.Script.runInContext({ timeout })` — CPU-bound timeout for sync JS
 * 2. `Effect.timeoutFail` — wall-clock timeout for the full async execution
 *
 * No `Promise.race` — timeout is handled by fiber interruption which properly
 * cleans up resources. The vm timeout catches infinite sync loops while the
 * Effect timeout catches slow async operations.
 */
const runSandbox = (
  globals: Record<string, unknown>,
  code: string,
  timeoutMs: number
): Effect.Effect<unknown, ExecutionTimeoutError | SandboxExecutionError> => {
  const execute = Effect.tryPromise({
    catch: (error) =>
      new SandboxExecutionError({
        error,
        message: formatError(error),
      }),
    try: () => {
      const context = vm.createContext({
        ...globals,
        Buffer: undefined,
        clearImmediate: undefined,
        clearInterval: undefined,
        clearTimeout: undefined,
        console: createSandboxConsole(),
        fetch: undefined,
        process: undefined,
        queueMicrotask,
        require: undefined,
        setImmediate: undefined,
        setInterval: undefined,
        setTimeout: undefined,
      });
      const script = new vm.Script(
        `"use strict"; (async () => {\n${code}\n})()`,
        { filename: "ringi-mcp-execute.js" }
      );
      // vm timeout guards sync CPU loops; Effect.timeoutFail guards the full async span
      return Promise.resolve(
        script.runInContext(context, { timeout: timeoutMs })
      );
    },
  });

  return execute.pipe(
    Effect.timeoutFail({
      duration: Duration.millis(timeoutMs),
      onTimeout: () =>
        new ExecutionTimeoutError({
          message: `Execution timed out after ${timeoutMs}ms`,
          timeoutMs,
        }),
    })
  );
};

// ---------------------------------------------------------------------------
// Journal helpers
// ---------------------------------------------------------------------------

const createJournal = () => {
  const entries: OperationJournalEntry[] = [];

  const recordSuccess = (name: string, result: unknown): void => {
    entries.push({ name, ok: true, result: summarizeForJournal(result) });
  };

  const recordFailure = (name: string, error: unknown): void => {
    entries.push({ error: formatError(error), name, ok: false });
  };

  /**
   * Runs a runtime Effect with journal tracking. Returns a Promise for sandbox use.
   *
   * The R parameter accepts any subset of McpRuntimeContext — the managed runtime
   * provides all services, so any effect requiring a subset of them is safe to run.
   */
  const tracked = <A, R extends McpRuntimeContext>(
    runtime: McpManagedRuntime,
    name: string,
    effect: Effect.Effect<A, unknown, R>
  ): Promise<A> =>
    runtime
      .runPromise(
        effect as unknown as Effect.Effect<A, never, McpRuntimeContext>
      )
      .then(
        (result) => {
          recordSuccess(name, result);
          return result;
        },
        (error) => {
          recordFailure(name, error);
          throw error;
        }
      );

  /** Promise-based call wrapper for non-Effect operations. */
  const trackedAsync = async <T>(
    name: string,
    fn: () => Promise<T>
  ): Promise<T> => {
    try {
      const result = await fn();
      recordSuccess(name, result);
      return result;
    } catch (error) {
      recordFailure(name, error);
      throw error;
    }
  };

  return { entries, recordFailure, recordSuccess, tracked, trackedAsync };
};

// ---------------------------------------------------------------------------
// buildSandboxGlobals — wire services to the runtime
// ---------------------------------------------------------------------------

const buildSandboxGlobals = (
  runtime: McpManagedRuntime,
  config: McpConfigShape,
  journal: ReturnType<typeof createJournal>
) => {
  const { tracked, trackedAsync } = journal;

  const throwIfReadonly = (): void => {
    if (config.readonly) {
      throw new Error(
        "Mutation rejected: MCP server is running in readonly mode"
      );
    }
  };

  // -- SandboxDeps (Promise bridge for sources/session/events) --------------

  const run = <A, R extends McpRuntimeContext>(
    name: string,
    effect: Effect.Effect<A, unknown, R>
  ): Promise<A> => tracked(runtime, name, effect);

  const deps: SandboxDeps = {
    call: trackedAsync,
    getBranchDiff: (branch: string) =>
      run(
        "git.getBranchDiff",
        Effect.gen(function* getBranchDiff() {
          const git = yield* GitService;
          return yield* git.getBranchDiff(branch);
        })
      ),
    getBranches: () =>
      run(
        "git.getBranches",
        Effect.gen(function* getBranches() {
          const git = yield* GitService;
          return yield* git.getBranches;
        })
      ),
    getCommitDiff: (shas: string[]) =>
      run(
        "git.getCommitDiff",
        Effect.gen(function* getCommitDiff() {
          const git = yield* GitService;
          return yield* git.getCommitDiff(shas);
        })
      ),
    getLatestReviewId: async () => {
      const result = await run(
        "reviews.latestId",
        Effect.gen(function* result() {
          const svc = yield* ReviewService;
          return yield* svc.list({
            page: 1,
            pageSize: 1,
            repositoryPath: config.repoRoot,
          });
        })
      );
      return result.reviews[0]?.id ?? null;
    },
    getRecentCommits: async () => {
      const result = await run(
        "git.getCommits",
        Effect.gen(function* result() {
          const git = yield* GitService;
          return yield* git.getCommits({ limit: 10, offset: 0 });
        })
      );
      return result.commits;
    },
    getRepositoryInfo: () =>
      run(
        "git.getRepositoryInfo",
        Effect.gen(function* getRepositoryInfo() {
          const git = yield* GitService;
          return yield* git.getRepositoryInfo;
        })
      ),
    getStagedDiff: () =>
      run(
        "git.getStagedDiff",
        Effect.gen(function* getStagedDiff() {
          const git = yield* GitService;
          return yield* git.getStagedDiff;
        })
      ),
    getStagedFiles: () =>
      run(
        "git.getStagedFiles",
        Effect.gen(function* getStagedFiles() {
          const git = yield* GitService;
          return yield* git.getStagedFiles;
        })
      ),
    readonly: config.readonly,
    repoRoot: config.repoRoot,
    requireWritable: throwIfReadonly,
  };

  const baseGlobals = createSandboxGlobals(deps);

  // -- reviews namespace (schema-validated) ---------------------------------

  const reviews = Object.freeze({
    create: async (inputValue: unknown) => {
      throwIfReadonly();
      const parsed = decodeReviewCreateInput(inputValue);
      return run(
        "reviews.create",
        Effect.gen(function* create() {
          const svc = yield* ReviewService;
          return yield* svc.create(parsed);
        })
      );
    },
    export: async (options: unknown) => {
      const opts = decodeInputSync(
        ReviewExportInput,
        options,
        "reviews.export"
      );
      const markdown = await run(
        "reviews.export",
        Effect.gen(function* markdown() {
          const svc = yield* ExportService;
          return yield* svc.exportReview(opts.reviewId);
        })
      );
      return { markdown, reviewId: opts.reviewId };
    },
    get: (reviewIdValue: unknown) => {
      const reviewId = reviewIdValue as ReviewId;
      return run(
        "reviews.get",
        Effect.gen(function* get() {
          const svc = yield* ReviewService;
          return yield* svc.getById(reviewId);
        })
      );
    },
    getComments: (reviewIdValue: unknown, filePath?: unknown) => {
      const reviewId = reviewIdValue as ReviewId;
      if (
        filePath !== null &&
        filePath !== undefined &&
        typeof filePath !== "string"
      ) {
        return Promise.reject(new Error("Invalid filePath: expected a string"));
      }
      return run(
        "reviews.getComments",
        Effect.gen(function* getComments() {
          const svc = yield* CommentService;
          return filePath
            ? yield* svc.getByFile(reviewId, filePath as string)
            : yield* svc.getByReview(reviewId);
        })
      );
    },
    getDiff: async (query: unknown) => {
      const q = decodeInputSync(ReviewDiffQuery, query, "reviews.getDiff");
      const hunks = await run(
        `reviews.getDiff:${q.filePath}`,
        Effect.gen(function* hunks() {
          const svc = yield* ReviewService;
          return yield* svc.getFileHunks(q.reviewId, q.filePath);
        })
      );
      return { filePath: q.filePath, hunks, reviewId: q.reviewId };
    },
    getFiles: async (reviewIdValue: unknown) => {
      const reviewId = reviewIdValue as ReviewId;
      const review = await run(
        "reviews.getFiles",
        Effect.gen(function* review() {
          const svc = yield* ReviewService;
          return yield* svc.getById(reviewId);
        })
      );
      return review.files;
    },
    getStatus: async (reviewIdValue: unknown) => {
      const reviewId = reviewIdValue as ReviewId;
      const [review, stats] = await Promise.all([
        run(
          "reviews.getStatus.review",
          Effect.gen(function* () {
            const svc = yield* ReviewService;
            return yield* svc.getById(reviewId);
          })
        ),
        run(
          "reviews.getStatus.comments",
          Effect.gen(function* () {
            const svc = yield* CommentService;
            return yield* svc.getStats(reviewId);
          })
        ),
      ]);
      return {
        resolvedComments: stats.resolved,
        reviewId,
        status: review.status,
        totalComments: stats.total,
        unresolvedComments: stats.unresolved,
        withSuggestions: 0,
      };
    },
    getSuggestions: async (reviewIdValue: unknown) => {
      const reviewId = reviewIdValue as ReviewId;
      const comments = await run(
        "reviews.getSuggestions",
        Effect.gen(function* comments() {
          const svc = yield* CommentService;
          return yield* svc.getByReview(reviewId);
        })
      );
      return comments
        .filter((c: { suggestion?: string | null }) => c.suggestion != null)
        .map((c: { id: string; suggestion: string | null }) => ({
          commentId: c.id,
          id: c.id,
          originalCode: "",
          suggestedCode: c.suggestion ?? "",
        }));
    },
    list: async (filters?: unknown) => {
      const parsed = decodeInputSync(
        ReviewListFilters,
        filters ?? {},
        "reviews.list"
      );
      return run(
        "reviews.list",
        Effect.gen(function* list() {
          const svc = yield* ReviewService;
          return yield* svc.list({
            page: parsed.page,
            pageSize: parsed.limit,
            repositoryPath: config.repoRoot,
            sourceType: parsed.sourceType,
            status: parsed.status as
              | "approved"
              | "changes_requested"
              | "in_progress"
              | undefined,
          });
        })
      );
    },
  });

  // -- todos namespace (schema-validated) -----------------------------------

  const todos = Object.freeze({
    add: async (inputValue: unknown) => {
      throwIfReadonly();
      const parsed = decodeCreateTodoInput(inputValue);
      return run(
        "todos.add",
        Effect.gen(function* add() {
          const svc = yield* TodoService;
          return yield* svc.create(parsed as CoreCreateTodoInput);
        })
      );
    },
    clear: async (_reviewIdValue?: unknown) => {
      throwIfReadonly();
      return run(
        "todos.clear",
        Effect.gen(function* clear() {
          const svc = yield* TodoService;
          const result = yield* svc.removeCompleted();
          return { removed: result.deleted, success: true as const };
        })
      );
    },
    done: async (todoIdValue: unknown) => {
      throwIfReadonly();
      const todoId = todoIdValue as TodoId;
      return run(
        "todos.done",
        Effect.gen(function* done() {
          const svc = yield* TodoService;
          const todo = yield* svc.getById(todoId);
          if (todo.completed) {
            return todo;
          }
          return yield* svc.toggle(todoId);
        })
      );
    },
    list: async (filter?: unknown) => {
      const parsed = decodeInputSync(
        TodoListFilter,
        filter ?? {},
        "todos.list"
      );
      const result = await run(
        "todos.list",
        Effect.gen(function* result() {
          const svc = yield* TodoService;
          return yield* svc.list({ reviewId: parsed.reviewId });
        })
      );
      return result.data;
    },
    move: async (todoIdValue: unknown, positionValue: unknown) => {
      throwIfReadonly();
      const parsed = decodeInputSync(
        TodoMoveInput,
        { position: positionValue, todoId: todoIdValue },
        "todos.move"
      );
      return run(
        "todos.move",
        Effect.gen(function* move() {
          const svc = yield* TodoService;
          return yield* svc.move(parsed.todoId, parsed.position);
        })
      );
    },
    remove: async (todoIdValue: unknown) => {
      throwIfReadonly();
      const todoId = todoIdValue as TodoId;
      return run(
        "todos.remove",
        Effect.gen(function* remove() {
          const svc = yield* TodoService;
          return yield* svc.remove(todoId);
        })
      );
    },
    undone: async (todoIdValue: unknown) => {
      throwIfReadonly();
      const todoId = todoIdValue as TodoId;
      return run(
        "todos.undone",
        Effect.gen(function* undone() {
          const svc = yield* TodoService;
          const todo = yield* svc.getById(todoId);
          if (!todo.completed) {
            return todo;
          }
          return yield* svc.toggle(todoId);
        })
      );
    },
  });

  return {
    events: baseGlobals.events,
    intelligence: baseGlobals.intelligence,
    reviews,
    session: baseGlobals.session,
    sources: baseGlobals.sources,
    todos,
  };
};

// ---------------------------------------------------------------------------
// executeCode — main entry point (Effect-first)
// ---------------------------------------------------------------------------

/**
 * Execute sandboxed user code against the Ringi core services.
 *
 * The execution pipeline is an Effect that:
 * - Validates code and timeout via typed errors
 * - Builds schema-validated sandbox namespaces
 * - Runs the VM sandbox with a deterministic timeout model
 *   (vm.Script timeout for sync loops + Effect.timeoutFail for async wall-clock)
 * - Propagates errors via typed tagged errors, never raw throws
 *
 * The managed runtime is passed explicitly — it provides the concrete service
 * environment. Individual sandbox namespace methods use `runtime.runPromise`
 * because they are called from user JS inside the vm sandbox (Promise boundary).
 */
export const executeCode = (
  runtime: McpManagedRuntime,
  config: McpConfigShape,
  input: ExecuteInput
): Effect.Effect<
  ExecuteOutput,
  InvalidCodeError | InvalidTimeoutError,
  never
> =>
  Effect.gen(function* executeCode() {
    const timeoutMs = yield* validateTimeout(input.timeout, config);
    const code = yield* validateCode(input.code);
    const journal = createJournal();
    const globals = buildSandboxGlobals(runtime, config, journal);

    const sandboxResult = yield* runSandbox(globals, code, timeoutMs).pipe(
      Effect.catchTags({
        ExecutionTimeoutError: (e) =>
          Effect.succeed({
            error: e.message,
            ok: false as const,
            result:
              journal.entries.length === 0
                ? null
                : { operations: journal.entries },
          }),
        SandboxExecutionError: (e) =>
          Effect.succeed({
            error: e.message,
            ok: false as const,
            result:
              journal.entries.length === 0
                ? null
                : { operations: journal.entries },
          }),
      }),
      Effect.map((result) => {
        if (
          typeof result === "object" &&
          result !== null &&
          "ok" in result &&
          (result as { ok: boolean }).ok === false
        ) {
          return result as ExecuteOutput;
        }
        return { ok: true as const, result } as ExecuteOutput;
      })
    );

    return finalizeOutput(sandboxResult, config.maxOutputBytes);
  });

// ---------------------------------------------------------------------------
// executeCodeToPromise — bridge for the MCP server
// ---------------------------------------------------------------------------

/**
 * Runs the Effect-based `executeCode` pipeline against the managed runtime.
 * This is the ONLY place `runtime.runPromise` is called for the execution
 * pipeline — the server boundary.
 *
 * Typed errors (InvalidCodeError, InvalidTimeoutError) are caught and
 * formatted as ExecuteOutput instead of propagating as rejections.
 */
export const executeCodeToPromise = async (
  runtime: McpManagedRuntime,
  config: McpConfigShape,
  input: ExecuteInput
): Promise<ExecuteOutput> => {
  const program = executeCode(runtime, config, input).pipe(
    Effect.catchTags({
      InvalidCodeError: (e) =>
        Effect.succeed<ExecuteOutput>({
          error: e.message,
          ok: false,
          result: null,
        }),
      InvalidTimeoutError: (e) =>
        Effect.succeed<ExecuteOutput>({
          error: e.message,
          ok: false,
          result: null,
        }),
    })
  );

  try {
    return await Effect.runPromise(program);
  } catch (error) {
    // Catch-all for defects — return a safe output
    return finalizeOutput(
      {
        error: formatError(error),
        ok: false,
        result: null,
      },
      config.maxOutputBytes
    );
  }
};
