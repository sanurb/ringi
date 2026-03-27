import * as Schema from "effect/Schema";

export const ReviewId = Schema.String.pipe(Schema.brand("ReviewId"));
export type ReviewId = typeof ReviewId.Type;

export const DIFF_SCOPES = [
  "uncommitted",
  "staged",
  "unstaged",
  "last-commit",
] as const;
export type DiffScope = (typeof DIFF_SCOPES)[number];

export const ReviewStatus = Schema.Literals([
  "in_progress",
  "approved",
  "changes_requested",
]);
export type ReviewStatus = typeof ReviewStatus.Type;

export const ReviewSourceType = Schema.Literals([
  "staged",
  "branch",
  "commits",
  "pull_request",
]);
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
  sourceRef: Schema.NullOr(Schema.String).pipe(
    Schema.optionalKey,
    Schema.withDecodingDefaultKey(() => null)
  ),
  sourceType: ReviewSourceType.pipe(
    Schema.optionalKey,
    Schema.withDecodingDefaultKey(() => "staged" as const)
  ),
});
export type CreateReviewInput = typeof CreateReviewInput.Type;

export const UpdateReviewInput = Schema.Struct({
  status: Schema.OptionFromNullOr(ReviewStatus).pipe(Schema.optionalKey),
});
export type UpdateReviewInput = typeof UpdateReviewInput.Type;

export class ReviewNotFound extends Schema.TaggedErrorClass<ReviewNotFound>()(
  "ReviewNotFound",
  { id: ReviewId }
) {}
