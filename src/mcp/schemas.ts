/**
 * MCP sandbox input schemas.
 *
 * Centralizes all validation for sandbox namespace inputs using Effect Schema.
 * Replaces hand-written parse* helpers with declarative, composable schemas.
 */

import * as Schema from "effect/Schema";

import { ReviewId, ReviewSourceType } from "@/api/schemas/review";
import { TodoId } from "@/api/schemas/todo";

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

const NonEmptyString = Schema.String.pipe(Schema.minLength(1));

// ---------------------------------------------------------------------------
// Review inputs
// ---------------------------------------------------------------------------

/**
 * Spec shape: `{ source: { type, baseRef } }`.
 * Legacy shape: `{ sourceType, sourceRef }`.
 *
 * We use Schema.Union to accept either and normalize to the legacy shape.
 */
const ReviewCreateFromSpec = Schema.Struct({
  source: Schema.Struct({
    baseRef: Schema.optionalWith(Schema.NullOr(Schema.String), {
      default: () => null,
    }),
    type: Schema.optionalWith(ReviewSourceType, {
      default: () => "staged" as const,
    }),
  }),
});

const ReviewCreateFromLegacy = Schema.Struct({
  sourceRef: Schema.optionalWith(Schema.NullOr(Schema.String), {
    default: () => null,
  }),
  sourceType: Schema.optionalWith(ReviewSourceType, {
    default: () => "staged" as const,
  }),
});

/** Normalized review creation input. */
export interface ReviewCreateInput {
  readonly sourceRef: string | null;
  readonly sourceType: "staged" | "branch" | "commits";
}

/** Decode unknown input into a normalized ReviewCreateInput. */
export const decodeReviewCreateInput = (input: unknown): ReviewCreateInput => {
  // Try spec shape first, then legacy
  if (
    typeof input === "object" &&
    input !== null &&
    "source" in (input as Record<string, unknown>)
  ) {
    const parsed = Schema.decodeUnknownSync(ReviewCreateFromSpec)(input);
    return {
      sourceRef: parsed.source.baseRef,
      sourceType: parsed.source.type,
    };
  }
  const parsed = Schema.decodeUnknownSync(ReviewCreateFromLegacy)(input);
  return {
    sourceRef: parsed.sourceRef,
    sourceType: parsed.sourceType,
  };
};

export const ReviewExportInput = Schema.Struct({
  reviewId: ReviewId,
});
export type ReviewExportInput = typeof ReviewExportInput.Type;

export const ReviewDiffQuery = Schema.Struct({
  filePath: NonEmptyString,
  reviewId: ReviewId,
});
export type ReviewDiffQuery = typeof ReviewDiffQuery.Type;

export const ReviewListFilters = Schema.Struct({
  limit: Schema.optionalWith(Schema.Number, { default: () => 20 }),
  page: Schema.optionalWith(Schema.Number, { default: () => 1 }),
  pageSize: Schema.optionalWith(Schema.Number, { default: () => 20 }),
  sourceType: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
});
export type ReviewListFilters = typeof ReviewListFilters.Type;

// ---------------------------------------------------------------------------
// Todo inputs
// ---------------------------------------------------------------------------

/**
 * Accepts both `text` (MCP spec) and `content` (legacy) for the todo body.
 * Normalizes to `{ content, reviewId }`.
 */
export interface CreateTodoInput {
  readonly content: string;
  readonly reviewId: typeof ReviewId.Type | null;
}

const TodoInputFromSpec = Schema.Struct({
  reviewId: Schema.optionalWith(Schema.NullOr(ReviewId), {
    default: () => null,
  }),
  text: NonEmptyString,
});

const TodoInputFromLegacy = Schema.Struct({
  content: NonEmptyString,
  reviewId: Schema.optionalWith(Schema.NullOr(ReviewId), {
    default: () => null,
  }),
});

/** Decode unknown input into a normalized CreateTodoInput. */
export const decodeCreateTodoInput = (input: unknown): CreateTodoInput => {
  if (
    typeof input === "object" &&
    input !== null &&
    "text" in (input as Record<string, unknown>)
  ) {
    const parsed = Schema.decodeUnknownSync(TodoInputFromSpec)(input);
    return { content: parsed.text, reviewId: parsed.reviewId };
  }
  const parsed = Schema.decodeUnknownSync(TodoInputFromLegacy)(input);
  return { content: parsed.content, reviewId: parsed.reviewId };
};

export const TodoListFilter = Schema.Struct({
  reviewId: Schema.optional(ReviewId),
});
export type TodoListFilter = typeof TodoListFilter.Type;

export const TodoMoveInput = Schema.Struct({
  position: Schema.Number,
  todoId: TodoId,
});
export type TodoMoveInput = typeof TodoMoveInput.Type;

// ---------------------------------------------------------------------------
// Re-exports for convenience
// ---------------------------------------------------------------------------

export { ReviewId, TodoId };
