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

export interface JsonEnvelope<T> {
  readonly data: T | null;
  readonly error?: string;
  readonly ok: boolean;
}

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
    };
