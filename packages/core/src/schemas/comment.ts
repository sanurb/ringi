import * as Schema from "effect/Schema";

import { ReviewId } from "./review";

export const CommentId = Schema.String.pipe(Schema.brand("CommentId"));
export type CommentId = typeof CommentId.Type;

export const LineType = Schema.Literals(["added", "removed", "context"]);
export type LineType = typeof LineType.Type;

export const Comment = Schema.Struct({
  content: Schema.String,
  createdAt: Schema.String,
  filePath: Schema.String,
  id: CommentId,
  lineNumber: Schema.NullOr(Schema.Number),
  lineType: Schema.NullOr(LineType),
  resolved: Schema.Boolean,
  reviewId: ReviewId,
  suggestion: Schema.NullOr(Schema.String),
  updatedAt: Schema.String,
});
export type Comment = typeof Comment.Type;

export const CreateCommentInput = Schema.Struct({
  content: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  filePath: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  lineNumber: Schema.NullOr(Schema.Number).pipe(
    Schema.optionalKey,
    Schema.withDecodingDefaultKey(() => null)
  ),
  lineType: Schema.NullOr(LineType).pipe(
    Schema.optionalKey,
    Schema.withDecodingDefaultKey(() => null)
  ),
  suggestion: Schema.NullOr(Schema.String).pipe(
    Schema.optionalKey,
    Schema.withDecodingDefaultKey(() => null)
  ),
});
export type CreateCommentInput = typeof CreateCommentInput.Type;

export const UpdateCommentInput = Schema.Struct({
  content: Schema.OptionFromNullOr(
    Schema.String.pipe(Schema.check(Schema.isMinLength(1)))
  ).pipe(Schema.optionalKey),
  suggestion: Schema.OptionFromNullOr(Schema.NullOr(Schema.String)).pipe(
    Schema.optionalKey
  ),
});
export type UpdateCommentInput = typeof UpdateCommentInput.Type;

export class CommentNotFound extends Schema.TaggedErrorClass<CommentNotFound>()(
  "CommentNotFound",
  { id: CommentId }
) {}
