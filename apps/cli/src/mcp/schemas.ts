/**
 * MCP sandbox input schemas.
 *
 * Centralizes all validation for sandbox namespace inputs using Effect Schema.
 * Replaces hand-written parse* helpers with declarative, composable schemas.
 */

import { ReviewId, ReviewSourceType } from "@ringi/core/schemas/review";
import { TodoId } from "@ringi/core/schemas/todo";
import * as Schema from "effect/Schema";

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

const NonEmptyString = Schema.String.pipe(Schema.check(Schema.isMinLength(1)));

// ---------------------------------------------------------------------------
// Review inputs
// ---------------------------------------------------------------------------

const ReviewCreateFromSpec = Schema.Struct({
  source: Schema.Struct({
    baseRef: Schema.NullOr(Schema.String).pipe(
      Schema.optionalKey,
      Schema.withDecodingDefaultKey(() => null)
    ),
    type: ReviewSourceType.pipe(
      Schema.optionalKey,
      Schema.withDecodingDefaultKey(() => "staged" as const)
    ),
  }),
});

const ReviewCreateFromLegacy = Schema.Struct({
  sourceRef: Schema.NullOr(Schema.String).pipe(
    Schema.optionalKey,
    Schema.withDecodingDefaultKey(() => null)
  ),
  sourceType: ReviewSourceType.pipe(
    Schema.optionalKey,
    Schema.withDecodingDefaultKey(() => "staged" as const)
  ),
});

/** Normalized review creation input (MCP only supports local sources). */
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
      sourceRef: parsed.source.baseRef ?? null,
      sourceType: (parsed.source.type ??
        "staged") as ReviewCreateInput["sourceType"],
    };
  }
  const parsed = Schema.decodeUnknownSync(ReviewCreateFromLegacy)(input);
  return {
    sourceRef: parsed.sourceRef ?? null,
    sourceType: (parsed.sourceType ??
      "staged") as ReviewCreateInput["sourceType"],
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
  limit: Schema.Number.pipe(
    Schema.optionalKey,
    Schema.withDecodingDefaultKey(() => 20)
  ),
  page: Schema.Number.pipe(
    Schema.optionalKey,
    Schema.withDecodingDefaultKey(() => 1)
  ),
  pageSize: Schema.Number.pipe(
    Schema.optionalKey,
    Schema.withDecodingDefaultKey(() => 20)
  ),
  sourceType: Schema.String.pipe(Schema.optionalKey),
  status: Schema.String.pipe(Schema.optionalKey),
});
export type ReviewListFilters = typeof ReviewListFilters.Type;

// ---------------------------------------------------------------------------
// Todo inputs
// ---------------------------------------------------------------------------

export interface CreateTodoInput {
  readonly content: string;
  readonly reviewId: typeof ReviewId.Type | null;
}

const TodoInputFromSpec = Schema.Struct({
  reviewId: Schema.NullOr(ReviewId).pipe(
    Schema.optionalKey,
    Schema.withDecodingDefaultKey(() => null)
  ),
  text: NonEmptyString,
});

const TodoInputFromLegacy = Schema.Struct({
  content: NonEmptyString,
  reviewId: Schema.NullOr(ReviewId).pipe(
    Schema.optionalKey,
    Schema.withDecodingDefaultKey(() => null)
  ),
});

/** Decode unknown input into a normalized CreateTodoInput. */
export const decodeCreateTodoInput = (input: unknown): CreateTodoInput => {
  if (
    typeof input === "object" &&
    input !== null &&
    "text" in (input as Record<string, unknown>)
  ) {
    const parsed = Schema.decodeUnknownSync(TodoInputFromSpec)(input);
    return { content: parsed.text, reviewId: parsed.reviewId ?? null };
  }
  const parsed = Schema.decodeUnknownSync(TodoInputFromLegacy)(input);
  return { content: parsed.content, reviewId: parsed.reviewId ?? null };
};

export const TodoListFilter = Schema.Struct({
  reviewId: ReviewId.pipe(Schema.optionalKey),
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
