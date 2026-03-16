import * as HttpApiSchema from "@effect/platform/HttpApiSchema";
import * as Schema from "effect/Schema";
import { ReviewId } from "./review";

export const CommentId = Schema.String.pipe(Schema.brand("CommentId"));
export type CommentId = typeof CommentId.Type;

export const LineType = Schema.Literal("added", "removed", "context");
export type LineType = typeof LineType.Type;

export const Comment = Schema.Struct({
  id: CommentId,
  reviewId: ReviewId,
  filePath: Schema.String,
  lineNumber: Schema.NullOr(Schema.Number),
  lineType: Schema.NullOr(LineType),
  content: Schema.String,
  suggestion: Schema.NullOr(Schema.String),
  resolved: Schema.Boolean,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type Comment = typeof Comment.Type;

export const CreateCommentInput = Schema.Struct({
  filePath: Schema.String.pipe(Schema.minLength(1)),
  lineNumber: Schema.optionalWith(Schema.NullOr(Schema.Number), { default: () => null }),
  lineType: Schema.optionalWith(Schema.NullOr(LineType), { default: () => null }),
  content: Schema.String.pipe(Schema.minLength(1)),
  suggestion: Schema.optionalWith(Schema.NullOr(Schema.String), { default: () => null }),
});
export type CreateCommentInput = typeof CreateCommentInput.Type;

export const UpdateCommentInput = Schema.Struct({
  content: Schema.optionalWith(Schema.String.pipe(Schema.minLength(1)), { as: "Option" }),
  suggestion: Schema.optionalWith(Schema.NullOr(Schema.String), { as: "Option" }),
});
export type UpdateCommentInput = typeof UpdateCommentInput.Type;

export class CommentNotFound extends Schema.TaggedError<CommentNotFound>()(
  "CommentNotFound",
  { id: CommentId },
  HttpApiSchema.annotations({ status: 404 }),
) {}
