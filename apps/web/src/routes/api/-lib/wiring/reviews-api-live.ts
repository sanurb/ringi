// @ts-nocheck — v4 handler type constraints require concrete return types; service interface uses `any`
import { DomainApi } from "@ringi/core/api/domain-api";
import { ReviewService } from "@ringi/core/services/review.service";
import * as Effect from "effect/Effect";
// @ts-nocheck — v4 handler type constraints require concrete return types; service interface uses `any`
import { HttpApiBuilder } from "effect/unstable/httpapi";

/**
 * Wires HttpApiBuilder handlers for the ReviewsApiGroup.
 */
export const ReviewsApiLive = HttpApiBuilder.group(
  DomainApi,
  "reviews",
  (handlers) =>
    handlers
      .handle("list", () =>
        Effect.gen(function* () {
          const svc = yield* ReviewService;
          return yield* svc.list({});
        })
      )
      .handle("getById", (_) =>
        Effect.gen(function* () {
          const svc = yield* ReviewService;
          return yield* svc.getById(_.params.id);
        })
      )
      .handle("create", (_) =>
        Effect.gen(function* () {
          const svc = yield* ReviewService;
          return yield* svc.create(_.payload);
        }).pipe(
          Effect.catchTags({
            GitError: (e) => Effect.die(e),
            ReviewError: (e) => Effect.die(e),
          })
        )
      )
      .handle("update", (_) =>
        Effect.gen(function* () {
          const svc = yield* ReviewService;
          return yield* svc.update(_.params.id, _.payload);
        })
      )
      .handle("remove", (_) =>
        Effect.gen(function* () {
          const svc = yield* ReviewService;
          return yield* svc.remove(_.params.id);
        })
      )
      .handle("stats", () =>
        Effect.gen(function* () {
          const svc = yield* ReviewService;
          return yield* svc.getStats();
        })
      )
);
