import * as HttpApiSchema from "@effect/platform/HttpApiSchema";
import * as Schema from "effect/Schema";

export const ReviewId = Schema.String.pipe(Schema.brand("ReviewId"));
export type ReviewId = typeof ReviewId.Type;

export const ReviewStatus = Schema.Literal(
  "in_progress",
  "approved",
  "changes_requested"
);
export type ReviewStatus = typeof ReviewStatus.Type;

export const ReviewSourceType = Schema.Literal("staged", "branch", "commits");
export type ReviewSourceType = typeof ReviewSourceType.Type;

export const Review = Schema.Struct({
  baseRef: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  id: ReviewId,
  repositoryPath: Schema.String,
  snapshotData: Schema.String,
  sourceRef: Schema.NullOr(Schema.String),
  sourceType: ReviewSourceType,
  status: ReviewStatus,
  updatedAt: Schema.String,
});
export type Review = typeof Review.Type;

export const CreateReviewInput = Schema.Struct({
  sourceRef: Schema.optionalWith(Schema.NullOr(Schema.String), {
    default: () => null,
  }),
  sourceType: Schema.optionalWith(ReviewSourceType, {
    default: () => "staged" as const,
  }),
});
export type CreateReviewInput = typeof CreateReviewInput.Type;

export const UpdateReviewInput = Schema.Struct({
  status: Schema.optionalWith(ReviewStatus, { as: "Option" }),
});
export type UpdateReviewInput = typeof UpdateReviewInput.Type;

export class ReviewNotFound extends Schema.TaggedError<ReviewNotFound>()(
  "ReviewNotFound",
  { id: ReviewId },
  HttpApiSchema.annotations({ status: 404 })
) {}
