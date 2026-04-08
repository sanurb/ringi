import { DomainApi } from "@ringi/core/api/domain-api";
import type { ReviewId } from "@ringi/core/schemas/review";
import { ReviewContextBuilder } from "@ringi/core/services/context-builder.service";
import * as Effect from "effect/Effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

export const ContextApiLive = HttpApiBuilder.group(
  DomainApi,
  "context",
  (handlers) =>
    handlers.handle("build", (_) =>
      Effect.gen(function* () {
        const builder = yield* ReviewContextBuilder;
        const context = yield* builder
          .buildContext({
            reviewId: _.params.reviewId as ReviewId,
            mode: _.query.mode,
            filePath: _.query.filePath ?? null,
          })
          .pipe(
            Effect.catchTag("FilePathRequired", (e) =>
              Effect.die(
                new Error(
                  `filePath query parameter is required for ${e.mode} mode`
                )
              )
            )
          );
        return {
          context,
          mode: _.query.mode,
          reviewId: _.params.reviewId,
        };
      })
    )
);
