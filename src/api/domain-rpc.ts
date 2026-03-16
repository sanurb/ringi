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
    success: Schema.Struct({
      reviews: Schema.Array(Review),
      total: Schema.Number,
      page: Schema.Number,
      pageSize: Schema.Number,
    }),
    payload: {
      page: Schema.Number,
      pageSize: Schema.Number,
      status: Schema.optional(Schema.String),
    },
  }),

  Rpc.make("getById", {
    success: Review,
    error: ReviewNotFound,
    payload: { id: ReviewId },
  }),

  Rpc.make("create", {
    success: Review,
    payload: { input: CreateReviewInput },
  }),

  Rpc.make("update", {
    success: Review,
    error: ReviewNotFound,
    payload: { id: ReviewId, input: UpdateReviewInput },
  }),

  Rpc.make("remove", {
    success: Schema.Struct({ success: Schema.Literal(true) }),
    error: ReviewNotFound,
    payload: { id: ReviewId },
  }),

  Rpc.make("stats", {
    success: Schema.Struct({
      total: Schema.Number,
      inProgress: Schema.Number,
      approved: Schema.Number,
      changesRequested: Schema.Number,
    }),
  }),
).prefix("reviews_") {}

// ── Merged RPC ─────────────────────────────────────────────────
export class DomainRpc extends RpcGroup.make().merge(ReviewsRpc) {}
