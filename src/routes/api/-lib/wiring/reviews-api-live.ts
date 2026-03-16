import * as HttpApiBuilder from "@effect/platform/HttpApiBuilder";
import * as Effect from "effect/Effect";

import { DomainApi } from "@/api/domain-api";
import { ReviewService } from "../services/review.service";

/**
 * Wires HttpApiBuilder handlers for the ReviewsApiGroup.
 *
 * Note: ReviewService leaks ReviewRepo, ReviewFileRepo, and GitService as
 * runtime requirements (accessed via yield* inside methods). Those must be
 * provided by the caller — typically at the AllRoutes composition level.
 */
export const ReviewsApiLive = HttpApiBuilder.group(
  DomainApi,
  "reviews",
  (handlers) =>
    handlers
      .handle("list", (_) =>
        Effect.gen(function* () {
          const svc = yield* ReviewService;
          return yield* svc.list({});
        }),
      )
      .handle("getById", (_) =>
        Effect.gen(function* () {
          const svc = yield* ReviewService;
          return yield* svc.getById(_.path.id);
        }),
      )
      .handle("create", (_) =>
        Effect.gen(function* () {
          const svc = yield* ReviewService;
          return yield* svc.create(_.payload);
        }).pipe(
          // GitError and ReviewError are not declared on the endpoint schema;
          // surface them as defects (HTTP 500) until the API contract is updated.
          Effect.catchTags({
            ReviewError: (e) => Effect.die(e),
            GitError: (e) => Effect.die(e),
          }),
        ),
      )
      .handle("update", (_) =>
        Effect.gen(function* () {
          const svc = yield* ReviewService;
          return yield* svc.update(_.path.id, _.payload);
        }),
      )
      .handle("remove", (_) =>
        Effect.gen(function* () {
          const svc = yield* ReviewService;
          return yield* svc.remove(_.path.id);
        }),
      )
      .handle("stats", (_) =>
        Effect.gen(function* () {
          const svc = yield* ReviewService;
          return yield* svc.getStats;
        }),
      ),
);
