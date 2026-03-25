import * as Schema from "effect/Schema";

import type { ReviewSourceType, ReviewStatus } from "@/api/schemas/review";

export const ExitCode = {
  AuthFailure: 5,
  ResourceNotFound: 3,
  RuntimeFailure: 1,
  StateUnavailable: 4,
  Success: 0,
  UsageError: 2,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

// ---------------------------------------------------------------------------
// Agent-first response envelope (RFC 9457-inspired)
// ---------------------------------------------------------------------------

/** Error family for agent routing logic — branch on category, not message text. */
export type ErrorCategory =
  | "auth"
  | "config"
  | "conflict"
  | "connection"
  | "not_found"
  | "server"
  | "validation";

/** Machine-readable param descriptor for a HATEOAS next-action template. */
export interface NextActionParam {
  readonly default?: number | string;
  readonly description?: string;
  readonly enum?: readonly string[];
  readonly required?: boolean;
  readonly value?: number | string;
}

/**
 * A command the agent can run next. Literal commands omit `params`;
 * template commands use `<required>` / `[--flag <value>]` POSIX syntax
 * and include a `params` map so the agent knows what to fill.
 */
export interface NextAction {
  readonly command: string;
  readonly description: string;
  readonly params?: Readonly<Record<string, NextActionParam>>;
}

/** Structured error detail — stable fields agents can branch on. */
export interface CliErrorDetail {
  /** Error family for routing logic. */
  readonly category: ErrorCategory;
  /** Machine-readable error code, e.g. `REVIEW_NOT_FOUND`. */
  readonly code: string;
  /** Human-readable explanation of this occurrence. */
  readonly message: string;
  /** Whether a retry can succeed. */
  readonly retryable: boolean;
  /** Seconds to wait before retrying, when `retryable` is true. */
  readonly retry_after?: number;
  /** Documentation URI, e.g. `ringi://errors/REVIEW_NOT_FOUND`. */
  readonly type?: string;
}

interface CliSuccessEnvelope<T> {
  readonly command: string;
  readonly next_actions: readonly NextAction[];
  readonly ok: true;
  readonly result: T;
}

export interface CliErrorEnvelope {
  readonly command: string;
  readonly error: CliErrorDetail;
  /** Plain-language actionable guidance for the agent. */
  readonly fix: string;
  readonly next_actions: readonly NextAction[];
  readonly ok: false;
}

// --- Envelope factory helpers ------------------------------------------------

export const success = <T>(
  command: string,
  result: T,
  nextActions: readonly NextAction[] = []
): CliSuccessEnvelope<T> => ({
  command,
  next_actions: nextActions,
  ok: true,
  result,
});

export const failure = (
  command: string,
  error: CliErrorDetail,
  fix: string,
  nextActions: readonly NextAction[] = []
): CliErrorEnvelope => ({
  command,
  error,
  fix,
  next_actions: nextActions,
  ok: false,
});

export interface GlobalOptions {
  color: boolean;
  dbPath?: string;
  help: boolean;
  json: boolean;
  quiet: boolean;
  repo?: string;
  verbose: boolean;
  version: boolean;
}

export interface CommandOutput<T> {
  readonly data: T;
  readonly human?: string;
  readonly nextActions?: readonly NextAction[];
}

/**
 * Carries an exit code and optional operator-facing details so callers can
 * present a short message without losing the underlying reason.
 */
export class CliFailure extends Schema.TaggedError<CliFailure>()("CliFailure", {
  details: Schema.optional(Schema.String),
  exitCode: Schema.Number,
  message: Schema.String,
}) {}

/**
 * Normalized CLI intent shared by the parser and executors so command handlers
 * never have to reason about raw argv tokens.
 */
export type ParsedCommand =
  | { readonly kind: "help"; readonly topic: readonly string[] }
  | { readonly kind: "version" }
  | {
      readonly kind: "review-list";
      readonly limit: number;
      readonly page: number;
      readonly source?: ReviewSourceType;
      readonly status?: ReviewStatus;
    }
  | {
      readonly comments: boolean;
      readonly id: string;
      readonly kind: "review-show";
      readonly todos: boolean;
    }
  | {
      readonly id: string;
      readonly kind: "review-export";
      readonly noResolved: boolean;
      readonly noSnippets: boolean;
      readonly outputPath?: string;
      readonly stdout: boolean;
    }
  | {
      readonly branch?: string;
      readonly commits?: string;
      readonly kind: "review-create";
      readonly source: ReviewSourceType;
      readonly title?: string;
    }
  | {
      readonly kind: "source-list";
    }
  | {
      readonly branch?: string;
      readonly commits?: string;
      readonly kind: "source-diff";
      readonly source: ReviewSourceType;
      readonly stat: boolean;
    }
  | {
      readonly kind: "todo-list";
      readonly limit?: number;
      readonly offset: number;
      readonly reviewId?: string;
      readonly status: "all" | "done" | "pending";
    }
  | {
      readonly kind: "todo-add";
      readonly position?: number;
      readonly reviewId?: string;
      readonly text: string;
    }
  | {
      readonly id: string;
      readonly kind: "todo-done";
    }
  | {
      readonly id: string;
      readonly kind: "todo-undone";
    }
  | {
      readonly id: string;
      readonly kind: "todo-move";
      readonly position: number;
    }
  | {
      readonly id: string;
      readonly kind: "todo-remove";
      readonly yes: boolean;
    }
  | {
      readonly all: boolean;
      readonly doneOnly: boolean;
      readonly kind: "todo-clear";
      readonly reviewId?: string;
      readonly yes: boolean;
    }
  | {
      readonly kind: "review-status";
      readonly reviewId?: string;
      readonly source?: ReviewSourceType;
    }
  | {
      readonly allComments: boolean;
      readonly id: string;
      readonly kind: "review-resolve";
      readonly yes: boolean;
    }
  | {
      readonly auth: boolean;
      readonly cert?: string;
      readonly host: string;
      readonly https: boolean;
      readonly key?: string;
      readonly kind: "serve";
      readonly noOpen: boolean;
      readonly password?: string;
      readonly port: number;
      readonly username?: string;
    }
  | {
      readonly kind: "mcp";
      readonly logLevel: "debug" | "error" | "info" | "silent";
      readonly readonly: boolean;
    }
  | {
      readonly kind: "doctor";
    }
  | {
      readonly kind: "data-migrate";
    }
  | {
      readonly keepExports: boolean;
      readonly kind: "data-reset";
      readonly yes: boolean;
    }
  | {
      readonly kind: "events";
      readonly since?: number;
      readonly type?: "comments" | "files" | "reviews" | "todos";
    };
