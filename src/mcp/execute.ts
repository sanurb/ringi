import { setTimeout as sleep } from "node:timers/promises";
import * as vm from "node:vm";

import * as Effect from "effect/Effect";
import type * as ManagedRuntime from "effect/ManagedRuntime";

import type { ReviewId } from "@/api/schemas/review";
import type { CreateTodoInput, TodoId } from "@/api/schemas/todo";
import { CommentService } from "@/core/services/comment.service";
import { ExportService } from "@/core/services/export.service";
import { GitService } from "@/core/services/git.service";
import { ReviewService } from "@/core/services/review.service";
import { TodoService } from "@/core/services/todo.service";
import type { McpConfigShape } from "@/mcp/config";
import { createSandboxGlobals } from "@/mcp/sandbox";
import type { SandboxDeps } from "@/mcp/sandbox";

const EMPTY_RESULT = null;
const MAX_CODE_LENGTH = 50_000;
const MIN_PREVIEW_BYTES = 256;

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

interface OperationJournalEntry {
  readonly error?: string;
  readonly name: string;
  readonly ok: boolean;
  readonly result?: unknown;
}

const mutationRejectedMessage =
  "Mutation rejected: MCP server is running in readonly mode";

export const clampTimeout = (
  requestedTimeout: number | undefined,
  config: Pick<McpConfigShape, "defaultTimeoutMs" | "maxTimeoutMs">
) => {
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

const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

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

  const truncatedOutput: ExecuteOutput = {
    ...output,
    result: {
      note: "Result truncated to fit MCP output budget",
      preview: truncateUtf8(JSON.stringify(output.result), previewBudget),
    },
    truncated: true,
  };

  return truncatedOutput;
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
// Input parsing helpers
// ---------------------------------------------------------------------------

const parseReviewId = (value: unknown, fieldName = "reviewId"): ReviewId => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid ${fieldName}: expected a non-empty string`);
  }
  return value as ReviewId;
};

const parseTodoId = (value: unknown, fieldName = "todoId"): TodoId => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid ${fieldName}: expected a non-empty string`);
  }
  return value as TodoId;
};

const isDefined = (value: unknown): boolean =>
  value !== null && value !== undefined;

const parseRequiredNonEmptyString = (
  value: unknown,
  fieldName: string
): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid ${fieldName}: expected a non-empty string`);
  }
  return value;
};

const parseOptionalString = (
  value: unknown,
  fieldName: string
): string | null => {
  if (!isDefined(value)) {
    return null;
  }
  if (typeof value !== "string") {
    throw new TypeError(`Invalid ${fieldName}: expected a string or null`);
  }
  return value;
};

const parseTodoInput = (value: unknown): CreateTodoInput => {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid todo input: expected an object");
  }
  const record = value as Record<string, unknown>;
  // Accept both 'text' (MCP spec) and 'content' (legacy) for compatibility
  const rawContent = record.text ?? record.content;
  const content = parseRequiredNonEmptyString(rawContent, "todo input text");
  const reviewId = parseOptionalString(record.reviewId, "todo input reviewId");
  return {
    content,
    reviewId: (reviewId ?? null) as CreateTodoInput["reviewId"],
  };
};

const parseReviewCreateInput = (
  value: unknown
): {
  readonly sourceRef: string | null;
  readonly sourceType: "branch" | "commits" | "staged";
} => {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid review input: expected an object");
  }
  const record = value as Record<string, unknown>;
  // Accept both spec shape { source: { type, ... } } and legacy { sourceType, sourceRef }
  let sourceType: string;
  let sourceRef: string | null = null;

  if (record.source && typeof record.source === "object") {
    const src = record.source as Record<string, unknown>;
    sourceType = (src.type as string) ?? "staged";
    sourceRef = (src.baseRef as string) ?? null;
  } else {
    sourceType = (record.sourceType as string) ?? "staged";
    sourceRef = (record.sourceRef as string) ?? null;
  }

  if (
    sourceType !== "staged" &&
    sourceType !== "branch" &&
    sourceType !== "commits"
  ) {
    throw new Error(
      'Invalid review input: sourceType must be "staged", "branch", or "commits"'
    );
  }

  return { sourceRef, sourceType };
};

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
// VM sandbox runner
// ---------------------------------------------------------------------------

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  const timeoutPromise = (async () => {
    await sleep(timeoutMs);
    throw new Error(`Execution timed out after ${timeoutMs}ms`);
  })();
  return Promise.race([promise, timeoutPromise]);
};

const runSandbox = (
  globals: Record<string, unknown>,
  code: string,
  timeoutMs: number
): Promise<unknown> => {
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

  const script = new vm.Script(`"use strict"; (async () => {\n${code}\n})()`, {
    filename: "ringi-mcp-execute.js",
  });

  const execution = Promise.resolve(
    script.runInContext(context, { timeout: timeoutMs })
  );

  return withTimeout(execution, timeoutMs);
};

// ---------------------------------------------------------------------------
// executeCode — main entry point
// ---------------------------------------------------------------------------

export const executeCode = async (
  runtime: ManagedRuntime.ManagedRuntime<any, any>,
  config: McpConfigShape,
  input: ExecuteInput
): Promise<ExecuteOutput> => {
  const journal: OperationJournalEntry[] = [];
  const timeoutMs = clampTimeout(input.timeout, config);

  const recordSuccess = (name: string, result: unknown): void => {
    journal.push({ name, ok: true, result: summarizeForJournal(result) });
  };

  const recordFailure = (name: string, error: unknown): void => {
    journal.push({ error: formatError(error), name, ok: false });
  };

  /** Runs an Effect against the runtime with journal tracking. */
  const callEffect = async <A, E>(
    name: string,
    effect: Effect.Effect<A, E, any>
  ) => {
    try {
      const result = await runtime.runPromise(effect);
      recordSuccess(name, result);
      return result;
    } catch (error) {
      recordFailure(name, error);
      throw error;
    }
  };

  const requireWritable = (): void => {
    if (config.readonly) {
      throw new Error(mutationRejectedMessage);
    }
  };

  // -- Build Effect-backed SandboxDeps --------------------------------------

  const deps: SandboxDeps = {
    call: async (name, fn) => {
      try {
        const result = await fn();
        recordSuccess(name, result);
        return result;
      } catch (error) {
        recordFailure(name, error);
        throw error;
      }
    },
    getBranchDiff: (branch: string) =>
      callEffect(
        "git.getBranchDiff",
        Effect.gen(function*  getBranchDiff() {
          const git = yield* GitService;
          return yield* git.getBranchDiff(branch);
        })
      ),
    getBranches: () =>
      callEffect(
        "git.getBranches",
        Effect.gen(function*  getBranches() {
          const git = yield* GitService;
          return yield* git.getBranches;
        })
      ),
    getCommitDiff: (shas: string[]) =>
      callEffect(
        "git.getCommitDiff",
        Effect.gen(function*  getCommitDiff() {
          const git = yield* GitService;
          return yield* git.getCommitDiff(shas);
        })
      ),
    getLatestReviewId: async () => {
      const result = await callEffect(
        "reviews.latestId",
        Effect.gen(function*  result() {
          const reviewService = yield* ReviewService;
          return yield* reviewService.list({
            page: 1,
            pageSize: 1,
            repositoryPath: config.repoRoot,
          });
        })
      );
      return result.reviews[0]?.id ?? null;
    },
    getRecentCommits: async () => {
      const result = await callEffect(
        "git.getCommits",
        Effect.gen(function*  result() {
          const git = yield* GitService;
          return yield* git.getCommits({ limit: 10, offset: 0 });
        })
      );
      return result.commits;
    },
    getRepositoryInfo: () =>
      callEffect(
        "git.getRepositoryInfo",
        Effect.gen(function*  getRepositoryInfo() {
          const git = yield* GitService;
          return yield* git.getRepositoryInfo;
        })
      ),
    getStagedDiff: () =>
      callEffect(
        "git.getStagedDiff",
        Effect.gen(function*  getStagedDiff() {
          const git = yield* GitService;
          return yield* git.getStagedDiff;
        })
      ),
    getStagedFiles: () =>
      callEffect(
        "git.getStagedFiles",
        Effect.gen(function*  getStagedFiles() {
          const git = yield* GitService;
          return yield* git.getStagedFiles;
        })
      ),
    readonly: config.readonly,
    repoRoot: config.repoRoot,
    requireWritable,
  };

  // -- Build globals with runtime-backed reviews/todos ----------------------
  // Override the stub methods from createSandboxGlobals with Effect-wired ones

  const baseGlobals = createSandboxGlobals(deps);

  // Wire reviews namespace to real services
  const reviews = Object.freeze({
    create: async (inputValue: unknown) => {
      requireWritable();
      const parsed = parseReviewCreateInput(inputValue);
      return callEffect(
        "reviews.create",
        Effect.gen(function*  create() {
          const reviewService = yield* ReviewService;
          return yield* reviewService.create(parsed);
        })
      );
    },
    export: async (options: unknown) => {
      if (typeof options !== "object" || options === null) {
        throw new Error("Invalid options: expected an object with reviewId");
      }
      const opts = options as Record<string, unknown>;
      const reviewId = parseReviewId(opts.reviewId);
      const markdown = await callEffect(
        "reviews.export",
        Effect.gen(function*  markdown() {
          const exportService = yield* ExportService;
          return yield* exportService.exportReview(reviewId);
        })
      );
      return { markdown, reviewId };
    },
    get: (reviewIdValue: unknown) => {
      const reviewId = parseReviewId(reviewIdValue);
      return callEffect(
        "reviews.get",
        Effect.gen(function*  get() {
          const reviewService = yield* ReviewService;
          return yield* reviewService.getById(reviewId);
        })
      );
    },
    getComments: (reviewIdValue: unknown, filePath?: unknown) => {
      const reviewId = parseReviewId(reviewIdValue);
      if (
        filePath !== null &&
        filePath !== undefined &&
        typeof filePath !== "string"
      ) {
        throw new Error("Invalid filePath: expected a string");
      }
      return callEffect(
        "reviews.getComments",
        Effect.gen(function*  getComments() {
          const commentService = yield* CommentService;
          return yield* filePath
            ? commentService.getByFile(reviewId, filePath as string)
            : commentService.getByReview(reviewId);
        })
      );
    },
    getDiff: async (query: unknown) => {
      if (typeof query !== "object" || query === null) {
        throw new Error(
          "Invalid query: expected an object with reviewId and filePath"
        );
      }
      const q = query as Record<string, unknown>;
      const reviewId = parseReviewId(q.reviewId);
      const filePath = parseRequiredNonEmptyString(
        q.filePath,
        "query.filePath"
      );
      const hunks = await callEffect(
        `reviews.getDiff:${filePath}`,
        Effect.gen(function*  hunks() {
          const reviewService = yield* ReviewService;
          return yield* reviewService.getFileHunks(reviewId, filePath);
        })
      );
      return { filePath, hunks, reviewId };
    },
    getFiles: async (reviewIdValue: unknown) => {
      const reviewId = parseReviewId(reviewIdValue);
      const review = await callEffect(
        "reviews.getFiles",
        Effect.gen(function*  review() {
          const reviewService = yield* ReviewService;
          return yield* reviewService.getById(reviewId);
        })
      );
      return review.files;
    },
    getStatus: async (reviewIdValue: unknown) => {
      const reviewId = parseReviewId(reviewIdValue);
      const [review, stats] = await Promise.all([
        callEffect(
          "reviews.getStatus.review",
          Effect.gen(function* () {
            const reviewService = yield* ReviewService;
            return yield* reviewService.getById(reviewId);
          })
        ),
        callEffect(
          "reviews.getStatus.comments",
          Effect.gen(function* () {
            const commentService = yield* CommentService;
            return yield* commentService.getStats(reviewId);
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
      const reviewId = parseReviewId(reviewIdValue);
      const comments = await callEffect(
        "reviews.getSuggestions",
        Effect.gen(function*  comments() {
          const commentService = yield* CommentService;
          return yield* commentService.getByReview(reviewId);
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
    list: (filters?: unknown) => {
      if (
        filters !== null &&
        filters !== undefined &&
        (typeof filters !== "object" || Array.isArray(filters))
      ) {
        throw new Error("Invalid filters: expected an object");
      }
      const record = (filters ?? {}) as Record<string, unknown>;
      const page = typeof record.page === "number" ? record.page : 1;
      const pageSize =
        typeof record.pageSize === "number" ? record.pageSize : 20;
      const limit = typeof record.limit === "number" ? record.limit : pageSize;
      const status =
        typeof record.status === "string" ? record.status : undefined;
      const sourceType =
        typeof record.sourceType === "string" ? record.sourceType : undefined;

      return callEffect(
        "reviews.list",
        Effect.gen(function*  list() {
          const reviewService = yield* ReviewService;
          return yield* reviewService.list({
            page,
            pageSize: limit,
            repositoryPath: config.repoRoot,
            sourceType,
            status: status as
              | "approved"
              | "changes_requested"
              | "in_progress"
              | undefined,
          });
        })
      );
    },
  });

  // Wire todos namespace to real services
  const todos = Object.freeze({
    add: async (inputValue: unknown) => {
      requireWritable();
      const parsed = parseTodoInput(inputValue);
      return callEffect(
        "todos.add",
        Effect.gen(function*  add() {
          const todoService = yield* TodoService;
          return yield* todoService.create(parsed);
        })
      );
    },
    clear: async (_reviewIdValue?: unknown) => {
      requireWritable();
      return callEffect(
        "todos.clear",
        Effect.gen(function*  clear() {
          const todoService = yield* TodoService;
          const result = yield* todoService.removeCompleted();
          return { removed: result.deleted, success: true as const };
        })
      );
    },
    done: async (todoIdValue: unknown) => {
      requireWritable();
      const todoId = parseTodoId(todoIdValue);
      return callEffect(
        "todos.done",
        Effect.gen(function*  done() {
          const todoService = yield* TodoService;
          const todo = yield* todoService.getById(todoId);
          if (todo.completed) {return todo;}
          return yield* todoService.toggle(todoId);
        })
      );
    },
    list: async (filter?: unknown) => {
      const record = (
        filter && typeof filter === "object" ? filter : {}
      ) as Record<string, unknown>;
      const reviewId =
        record.reviewId === null || record.reviewId === undefined
          ? undefined
          : parseReviewId(record.reviewId);
      const result = await callEffect(
        "todos.list",
        Effect.gen(function*  result() {
          const todoService = yield* TodoService;
          return yield* todoService.list({ reviewId });
        })
      );
      return result.data;
    },
    move: async (todoIdValue: unknown, positionValue: unknown) => {
      requireWritable();
      const todoId = parseTodoId(todoIdValue);
      if (
        typeof positionValue !== "number" ||
        !Number.isFinite(positionValue)
      ) {
        throw new TypeError("Invalid position: expected a number");
      }
      return callEffect(
        "todos.move",
        Effect.gen(function*  move() {
          const todoService = yield* TodoService;
          return yield* todoService.move(todoId, positionValue);
        })
      );
    },
    remove: async (todoIdValue: unknown) => {
      requireWritable();
      const todoId = parseTodoId(todoIdValue);
      return callEffect(
        "todos.remove",
        Effect.gen(function*  remove() {
          const todoService = yield* TodoService;
          return yield* todoService.remove(todoId);
        })
      );
    },
    undone: async (todoIdValue: unknown) => {
      requireWritable();
      const todoId = parseTodoId(todoIdValue);
      return callEffect(
        "todos.undone",
        Effect.gen(function*  undone() {
          const todoService = yield* TodoService;
          const todo = yield* todoService.getById(todoId);
          if (!todo.completed) {return todo;}
          return yield* todoService.toggle(todoId);
        })
      );
    },
  });

  const globals = {
    events: baseGlobals.events,
    intelligence: baseGlobals.intelligence,
    reviews,
    session: baseGlobals.session,
    sources: baseGlobals.sources,
    todos,
  };

  try {
    const result = await runSandbox(globals, ensureCode(input.code), timeoutMs);
    return finalizeOutput(
      {
        ok: true,
        result,
      },
      config.maxOutputBytes
    );
  } catch (error) {
    return finalizeOutput(
      {
        error: formatError(error),
        ok: false,
        result:
          journal.length === 0
            ? EMPTY_RESULT
            : {
                operations: journal,
              },
      },
      config.maxOutputBytes
    );
  }
};
