import * as Schema from "effect/Schema";

import { ReviewId } from "./review";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const AnnotationType = Schema.Literals([
  "comment",
  "suggestion",
  "concern",
]);
export type AnnotationType = typeof AnnotationType.Type;

export const AnnotationSeverity = Schema.Literals([
  "critical",
  "important",
  "nit",
  "pre_existing",
]);
export type AnnotationSeverity = typeof AnnotationSeverity.Type;

export const AnnotationSide = Schema.Literals(["old", "new"]);
export type AnnotationSide = typeof AnnotationSide.Type;

// ---------------------------------------------------------------------------
// Domain entity
// ---------------------------------------------------------------------------

export const ReviewAnnotation = Schema.Struct({
  author: Schema.NullOr(Schema.String),
  content: Schema.String,
  createdAt: Schema.String,
  filePath: Schema.String,
  hunkStableId: Schema.NullOr(Schema.String),
  id: Schema.String,
  lineEnd: Schema.Number,
  lineStart: Schema.Number,
  reasoning: Schema.NullOr(Schema.String),
  reviewId: ReviewId,
  severity: Schema.NullOr(AnnotationSeverity),
  side: AnnotationSide,
  source: Schema.String,
  suggestedCode: Schema.NullOr(Schema.String),
  type: AnnotationType,
});
export type ReviewAnnotation = typeof ReviewAnnotation.Type;

// ---------------------------------------------------------------------------
// Input schema for creation
// ---------------------------------------------------------------------------

export const CreateAnnotationInput = Schema.Struct({
  author: Schema.NullOr(Schema.String).pipe(
    Schema.optionalKey,
    Schema.withDecodingDefaultKey(() => null)
  ),
  content: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  filePath: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  hunkStableId: Schema.NullOr(Schema.String).pipe(
    Schema.optionalKey,
    Schema.withDecodingDefaultKey(() => null)
  ),
  lineEnd: Schema.Number,
  lineStart: Schema.Number,
  reasoning: Schema.NullOr(Schema.String).pipe(
    Schema.optionalKey,
    Schema.withDecodingDefaultKey(() => null)
  ),
  severity: Schema.NullOr(AnnotationSeverity).pipe(
    Schema.optionalKey,
    Schema.withDecodingDefaultKey(() => null)
  ),
  side: AnnotationSide.pipe(
    Schema.optionalKey,
    Schema.withDecodingDefaultKey(() => "new" as const)
  ),
  source: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  suggestedCode: Schema.NullOr(Schema.String).pipe(
    Schema.optionalKey,
    Schema.withDecodingDefaultKey(() => null)
  ),
  type: AnnotationType.pipe(
    Schema.optionalKey,
    Schema.withDecodingDefaultKey(() => "comment" as const)
  ),
});
export type CreateAnnotationInput = typeof CreateAnnotationInput.Type;

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class AnnotationNotFound extends Schema.TaggedErrorClass<AnnotationNotFound>()(
  "AnnotationNotFound",
  { id: Schema.String }
) {}
