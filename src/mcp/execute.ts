import { setTimeout as sleep } from "node:timers/promises";
import * as vm from "node:vm";

import * as Effect from "effect/Effect";
import type * as ManagedRuntime from "effect/ManagedRuntime";

import type { CreateCommentInput } from "@/api/schemas/comment";
import type { ReviewId } from "@/api/schemas/review";
import type { CreateTodoInput, TodoId } from "@/api/schemas/todo";
import { CommentService } from "@/core/services/comment.service";
import { ExportService } from "@/core/services/export.service";
import { GitService } from "@/core/services/git.service";
import { ReviewService } from "@/core/services/review.service";
import { TodoService } from "@/core/services/todo.service";
import type { McpConfigShape } from "@/mcp/config";

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

interface SessionContext {
  readonly activeReviewId: string | null;
  readonly readonly: boolean;
  readonly repository: {
    readonly branch: string;
    readonly name: string;
    readonly path: string;
    readonly remote: string | null;
  };
  readonly serverMode: "stdio";
}

interface SandboxGlobals {
  readonly comment: object;
  readonly diff: object;
  readonly export: object;
  readonly session: object;
  readonly todo: object;
  readonly review: object;
}

const mutationRejectedMessage =
  "Mutation rejected: MCP server is running in readonly mode";

const clampTimeout = (
  requestedTimeout: number | undefined,
  config: McpConfigShape
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

const finalizeOutput = (
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

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  const timeoutPromise = (async () => {
    await sleep(timeoutMs);
    throw new Error(`Execution timed out after ${timeoutMs}ms`);
  })();

  return Promise.race([promise, timeoutPromise]);
};

const ensureCode = (code: unknown): string => {
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

const parseOptionalLineNumber = (value: unknown): number | null => {
  if (!isDefined(value)) {
    return null;
  }

  if (typeof value !== "number") {
    throw new TypeError(
      "Invalid comment input: lineNumber must be a number or null"
    );
  }

  return value;
};

const parseOptionalLineType = (
  value: unknown
): CreateCommentInput["lineType"] => {
  if (!isDefined(value)) {
    return null;
  }

  if (value === "added" || value === "removed" || value === "context") {
    return value;
  }

  throw new Error(
    'Invalid comment input: lineType must be "added", "removed", "context", or null'
  );
};

const parseTodoInput = (value: unknown): CreateTodoInput => {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid todo input: expected an object");
  }

  const record = value as Record<string, unknown>;
  const content = parseRequiredNonEmptyString(
    record.content,
    "todo input content"
  );
  const reviewId = parseOptionalString(record.reviewId, "todo input reviewId");

  return {
    content,
    reviewId: (reviewId ?? null) as CreateTodoInput["reviewId"],
  };
};

const parseCommentInput = (
  value: unknown
): CreateCommentInput & {
  readonly reviewId: ReviewId;
} => {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid comment input: expected an object");
  }

  const record = value as Record<string, unknown>;
  const content = parseRequiredNonEmptyString(
    record.content,
    "comment input content"
  );
  const filePath = parseRequiredNonEmptyString(
    record.filePath,
    "comment input filePath"
  );
  const lineNumber = parseOptionalLineNumber(record.lineNumber);
  const lineType = parseOptionalLineType(record.lineType);
  const reviewId = parseReviewId(record.reviewId);
  const suggestion = parseOptionalString(
    record.suggestion,
    "comment input suggestion"
  );

  return {
    content,
    filePath,
    lineNumber,
    lineType,
    reviewId,
    suggestion,
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
  const sourceType = record.sourceType ?? "staged";
  const sourceRef = record.sourceRef ?? null;

  if (
    sourceType !== "staged" &&
    sourceType !== "branch" &&
    sourceType !== "commits"
  ) {
    throw new Error(
      'Invalid review input: sourceType must be "staged", "branch", or "commits"'
    );
  }

  if (
    sourceRef !== null &&
    sourceRef !== undefined &&
    typeof sourceRef !== "string"
  ) {
    throw new Error("Invalid review input: sourceRef must be a string or null");
  }

  return {
    sourceRef,
    sourceType,
  };
};

const runSandbox = (
  globals: SandboxGlobals,
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

export const executeCode = async <R, ER>(
  runtime: ManagedRuntime.ManagedRuntime<R, ER>,
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

  const call = async <A, E, R0 extends R>(
    name: string,
    effect: Effect.Effect<A, E, R0>
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

  const sessionContext = async (): Promise<SessionContext> => {
    const repository = await call(
      "session.context",
      Effect.gen(function* repository() {
        const git = yield* GitService;
        return yield* git.getRepositoryInfo;
      })
    );

    const latestReview = await call(
      "session.latestReview",
      Effect.gen(function* latestReview() {
        const reviewService = yield* ReviewService;
        return yield* reviewService.list({
          page: 1,
          pageSize: 1,
          repositoryPath: config.repoRoot,
        });
      })
    );

    return {
      activeReviewId: latestReview.reviews[0]?.id ?? null,
      readonly: config.readonly,
      repository,
      serverMode: "stdio",
    };
  };

  const globals: SandboxGlobals = {
    comment: Object.freeze({
      add: (inputValue: unknown) => {
        requireWritable();
        const parsed = parseCommentInput(inputValue);
        return call(
          "comment.add",
          Effect.gen(function* add() {
            const commentService = yield* CommentService;
            return yield* commentService.create(parsed.reviewId, parsed);
          })
        );
      },
      list: (reviewIdValue: unknown, filePath?: unknown) => {
        const reviewId = parseReviewId(reviewIdValue);
        if (
          filePath !== null &&
          filePath !== undefined &&
          typeof filePath !== "string"
        ) {
          throw new Error("Invalid filePath: expected a string");
        }

        return call(
          "comment.list",
          Effect.gen(function* list() {
            const commentService = yield* CommentService;
            return yield* filePath
              ? commentService.getByFile(reviewId, filePath)
              : commentService.getByReview(reviewId);
          })
        );
      },
    }),
    diff: Object.freeze({
      files: async (reviewIdValue: unknown) => {
        const reviewId = parseReviewId(reviewIdValue);
        const review = await call(
          "diff.files",
          Effect.gen(function* review() {
            const reviewService = yield* ReviewService;
            return yield* reviewService.getById(reviewId);
          })
        );
        return review.files;
      },
      get: async (reviewIdValue: unknown) => {
        const reviewId = parseReviewId(reviewIdValue);
        const review = await call(
          "diff.review",
          Effect.gen(function* review() {
            const reviewService = yield* ReviewService;
            return yield* reviewService.getById(reviewId);
          })
        );

        const files = await Promise.all(
          review.files.map(async (file) => ({
            ...file,
            hunks: await call(
              `diff.get:${file.filePath}`,
              Effect.gen(function* hunks() {
                const reviewService = yield* ReviewService;
                return yield* reviewService.getFileHunks(
                  reviewId,
                  file.filePath
                );
              })
            ),
          }))
        );

        return { files, reviewId };
      },
    }),
    export: Object.freeze({
      review: async (reviewIdValue: unknown, formatValue?: unknown) => {
        const reviewId = parseReviewId(reviewIdValue);
        const format = formatValue ?? "markdown";
        if (format !== "markdown") {
          throw new Error(
            `Unsupported export format: ${String(format)}. Only markdown is available`
          );
        }

        const markdown = await call(
          "export.review",
          Effect.gen(function* markdown() {
            const exportService = yield* ExportService;
            return yield* exportService.exportReview(reviewId);
          })
        );

        return { format, markdown, reviewId };
      },
    }),
    review: Object.freeze({
      create: (inputValue: unknown) => {
        requireWritable();
        const parsed = parseReviewCreateInput(inputValue);
        return call(
          "review.create",
          Effect.gen(function* create() {
            const reviewService = yield* ReviewService;
            return yield* reviewService.create(parsed);
          })
        );
      },
      get: (reviewIdValue: unknown) => {
        const reviewId = parseReviewId(reviewIdValue);
        return call(
          "review.get",
          Effect.gen(function* get() {
            const reviewService = yield* ReviewService;
            return yield* reviewService.getById(reviewId);
          })
        );
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
        const status =
          typeof record.status === "string" ? record.status : undefined;
        const sourceType =
          typeof record.sourceType === "string" ? record.sourceType : undefined;

        return call(
          "review.list",
          Effect.gen(function* list() {
            const reviewService = yield* ReviewService;
            return yield* reviewService.list({
              page,
              pageSize,
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
    }),
    session: Object.freeze({
      context: () => sessionContext(),
      status: () => ({
        activeSubscriptions: 0,
        currentPhase: "phase1",
        ok: true,
        readonly: config.readonly,
      }),
    }),
    todo: Object.freeze({
      add: (inputValue: unknown) => {
        requireWritable();
        const parsed = parseTodoInput(inputValue);
        return call(
          "todo.add",
          Effect.gen(function* add() {
            const todoService = yield* TodoService;
            return yield* todoService.create(parsed);
          })
        );
      },
      list: async (reviewIdValue?: unknown) => {
        const reviewId =
          reviewIdValue === null || reviewIdValue === undefined
            ? undefined
            : parseReviewId(reviewIdValue);
        const result = await call(
          "todo.list",
          Effect.gen(function* result() {
            const todoService = yield* TodoService;
            return yield* todoService.list({ reviewId });
          })
        );
        return result.data;
      },
      toggle: (todoIdValue: unknown) => {
        requireWritable();
        const todoId = parseTodoId(todoIdValue);
        return call(
          "todo.toggle",
          Effect.gen(function* toggle() {
            const todoService = yield* TodoService;
            return yield* todoService.toggle(todoId);
          })
        );
      },
    }),
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
