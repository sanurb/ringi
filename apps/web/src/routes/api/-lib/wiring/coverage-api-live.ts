// @ts-nocheck — v4 handler type constraints require concrete return types
import { DomainApi } from "@ringi/core/api/domain-api";
import { CoverageService } from "@ringi/core/services/coverage.service";
import { EventService } from "@ringi/core/services/event.service";
import * as Effect from "effect/Effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

/**
 * Wires HttpApiBuilder handlers for the CoverageApiGroup.
 */
export const CoverageApiLive = HttpApiBuilder.group(
  DomainApi,
  "coverage",
  (handlers) =>
    handlers
      .handle("summary", (_) =>
        Effect.gen(function* () {
          const svc = yield* CoverageService;
          return yield* svc.getSummary(_.params.reviewId);
        })
      )
      .handle("mark", (_) =>
        Effect.gen(function* () {
          const svc = yield* CoverageService;
          const events = yield* EventService;
          const { hunkStableId, startLine, endLine } = _.payload;
          if (startLine !== null && endLine !== null) {
            yield* svc.markRangeReviewed(
              _.params.reviewId,
              hunkStableId,
              startLine,
              endLine
            );
          } else {
            yield* svc.markHunkReviewed(_.params.reviewId, hunkStableId);
          }
          yield* events.broadcast("files", {
            action: "updated",
            type: "coverage",
          });
          return { success: true as const };
        })
      )
      .handle("unmark", (_) =>
        Effect.gen(function* () {
          const svc = yield* CoverageService;
          const events = yield* EventService;
          yield* svc.unmark(_.params.reviewId, _.params.hunkStableId);
          yield* events.broadcast("files", {
            action: "updated",
            type: "coverage",
          });
          return { success: true as const };
        })
      )
);
