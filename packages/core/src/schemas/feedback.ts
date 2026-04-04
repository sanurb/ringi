import * as Schema from "effect/Schema";

import { ReviewId, ReviewStatus } from "./review";

export const ReviewFeedback = Schema.Struct({
  commentCount: Schema.Number,
  markdown: Schema.String,
  reviewId: ReviewId,
  status: ReviewStatus,
  todoCount: Schema.Number,
});
export type ReviewFeedback = typeof ReviewFeedback.Type;
