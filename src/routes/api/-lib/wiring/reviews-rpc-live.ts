import * as Effect from "effect/Effect";

import { ReviewsRpc } from "@/api/domain-rpc";
import type { ReviewStatus } from "@/api/schemas/review";
import { ReviewService } from "@/core/services/review.service";

/**
 * Wires RPC handlers for ReviewsRpc.
 *
 * ReviewService leaks ReviewRepo, ReviewFileRepo, and GitService as runtime
 * requirements. Those must be provided by the caller.
 */
export const ReviewsRpcLive = ReviewsRpc.toLayer({
  reviews_create: (_) =>
    Effect.gen(function* reviews_create() {
      const svc = yield* ReviewService;
      return yield* svc.create(_.input);
    }).pipe(
      // GitError and ReviewError are not declared in the RPC schema;
      // surface them as defects until the RPC contract is updated.
      Effect.catchTags({
        GitError: (e) => Effect.die(e),
        ReviewError: (e) => Effect.die(e),
      })
    ),
  reviews_getById: (_) =>
    Effect.gen(function* reviews_getById() {
      const svc = yield* ReviewService;
      return yield* svc.getById(_.id);
    }),
  reviews_list: (_) =>
    Effect.gen(function* reviews_list() {
      const svc = yield* ReviewService;
      return yield* svc.list({
        page: _.page,
        pageSize: _.pageSize,
        status: _.status as ReviewStatus | undefined,
      });
    }),
  reviews_remove: (_) =>
    Effect.gen(function* reviews_remove() {
      const svc = yield* ReviewService;
      return yield* svc.remove(_.id);
    }),
  reviews_stats: (_) =>
    Effect.gen(function* reviews_stats() {
      const svc = yield* ReviewService;
      return yield* svc.getStats;
    }),
  reviews_update: (_) =>
    Effect.gen(function* reviews_update() {
      const svc = yield* ReviewService;
      return yield* svc.update(_.id, _.input);
    }),
});
