// @ts-nocheck — v4 handler type constraints require concrete return types
import { DomainApi } from "@ringi/core/api/domain-api";
import { AnnotationService } from "@ringi/core/services/annotation.service";
import { EventService } from "@ringi/core/services/event.service";
import { ReviewService } from "@ringi/core/services/review.service";
import * as Effect from "effect/Effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

/**
 * Wires HttpApiBuilder handlers for the AnnotationsApiGroup.
 */
export const AnnotationsApiLive = HttpApiBuilder.group(
  DomainApi,
  "annotations",
  (handlers) =>
    handlers
      .handle("create", (_) =>
        Effect.gen(function* () {
          const svc = yield* AnnotationService;
          const events = yield* EventService;
          const review = yield* ReviewService;
          // Validate review exists
          yield* review.getById(_.params.reviewId);
          const created = yield* svc.add(
            _.params.reviewId,
            _.payload.annotations
          );
          yield* events.broadcast("comments", {
            action: "created",
            type: "annotations",
          });
          return created;
        })
      )
      .handle("list", (_) =>
        Effect.gen(function* () {
          const svc = yield* AnnotationService;
          if (_.query.filePath) {
            return yield* svc.findByFile(_.params.reviewId, _.query.filePath);
          }
          return yield* svc.findByReview(_.params.reviewId);
        })
      )
      .handle("stats", (_) =>
        Effect.gen(function* () {
          const svc = yield* AnnotationService;
          return yield* svc.stats(_.params.reviewId);
        })
      )
      .handle("clearBySource", (_) =>
        Effect.gen(function* () {
          const svc = yield* AnnotationService;
          const events = yield* EventService;
          const deleted = yield* svc.clearBySource(
            _.params.reviewId,
            _.query.source
          );
          yield* events.broadcast("comments", {
            action: "cleared",
            type: "annotations",
          });
          return { deleted };
        })
      )
      .handle("removeById", (_) =>
        Effect.gen(function* () {
          const svc = yield* AnnotationService;
          const events = yield* EventService;
          const success = yield* svc.removeById(_.params.annId);
          yield* events.broadcast("comments", {
            action: "deleted",
            type: "annotations",
          });
          return { success };
        })
      )
);
