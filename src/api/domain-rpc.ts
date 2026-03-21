import * as Rpc from "@effect/rpc/Rpc";
import * as RpcGroup from "@effect/rpc/RpcGroup";
import * as Schema from "effect/Schema";

import {
  CreateReviewInput,
  Review,
  ReviewId,
  ReviewNotFound,
  UpdateReviewInput,
} from "./schemas/review";

// ── Reviews RPC ────────────────────────────────────────────────
export class ReviewsRpc extends RpcGroup.make(
  Rpc.make("list", {
    payload: {
      page: Schema.Number,
      pageSize: Schema.Number,
      status: Schema.optional(Schema.String),
    },
    success: Schema.Struct({
      page: Schema.Number,
      pageSize: Schema.Number,
      reviews: Schema.Array(Review),
      total: Schema.Number,
    }),
  }),

  Rpc.make("getById", {
    error: ReviewNotFound,
    payload: { id: ReviewId },
    success: Review,
  }),

  Rpc.make("create", {
    payload: { input: CreateReviewInput },
    success: Review,
  }),

  Rpc.make("update", {
    error: ReviewNotFound,
    payload: { id: ReviewId, input: UpdateReviewInput },
    success: Review,
  }),

  Rpc.make("remove", {
    error: ReviewNotFound,
    payload: { id: ReviewId },
    success: Schema.Struct({ success: Schema.Literal(true) }),
  }),

  Rpc.make("stats", {
    success: Schema.Struct({
      approved: Schema.Number,
      changesRequested: Schema.Number,
      inProgress: Schema.Number,
      total: Schema.Number,
    }),
  })
).prefix("reviews_") {}

// ── Merged RPC ─────────────────────────────────────────────────
export class DomainRpc extends RpcGroup.make().merge(ReviewsRpc) {}
