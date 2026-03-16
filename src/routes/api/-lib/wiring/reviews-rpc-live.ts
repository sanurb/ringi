import * as Effect from "effect/Effect";

import type { ReviewStatus } from "@/api/schemas/review";
import { ReviewsRpc } from "@/api/domain-rpc";
import { ReviewService } from "../services/review.service";

/**
 * Wires RPC handlers for ReviewsRpc.
 *
 * ReviewService leaks ReviewRepo, ReviewFileRepo, and GitService as runtime
 * requirements. Those must be provided by the caller.
 */
export const ReviewsRpcLive = ReviewsRpc.toLayer({
  reviews_list: (_) =>
    Effect.gen(function* () {
      const svc = yield* ReviewService;
      return yield* svc.list({
        page: _.page,
        pageSize: _.pageSize,
        status: _.status as ReviewStatus | undefined,
      });
    }),
  reviews_getById: (_) =>
    Effect.gen(function* () {
      const svc = yield* ReviewService;
      return yield* svc.getById(_.id);
    }),
  reviews_create: (_) =>
    Effect.gen(function* () {
      const svc = yield* ReviewService;
      return yield* svc.create(_.input);
    }).pipe(
      // GitError and ReviewError are not declared in the RPC schema;
      // surface them as defects until the RPC contract is updated.
      Effect.catchTags({
        ReviewError: (e) => Effect.die(e),
        GitError: (e) => Effect.die(e),
      }),
    ),
  reviews_update: (_) =>
    Effect.gen(function* () {
      const svc = yield* ReviewService;
      return yield* svc.update(_.id, _.input);
    }),
  reviews_remove: (_) =>
    Effect.gen(function* () {
      const svc = yield* ReviewService;
      return yield* svc.remove(_.id);
    }),
  reviews_stats: (_) =>
    Effect.gen(function* () {
      const svc = yield* ReviewService;
      return yield* svc.getStats;
    }),
});
