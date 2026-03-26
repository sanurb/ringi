import * as HttpApiBuilder from "@effect/platform/HttpApiBuilder";
import { DomainApi } from "@ringi/core/api/domain-api";
import { EventService } from "@ringi/core/services/event.service";
import * as Effect from "effect/Effect";

export const EventsApiLive = HttpApiBuilder.group(
  DomainApi,
  "events",
  (handlers) =>
    handlers
      .handle("notify", (_) =>
        Effect.gen(function* EventsApiLive() {
          const events = yield* EventService;
          yield* events.broadcast(_.payload.type, {
            action: _.payload.action,
          });
          return { success: true as const };
        })
      )
      .handle("clients", (_) =>
        Effect.gen(function* EventsApiLive() {
          const events = yield* EventService;
          const count = yield* events.getClientCount();
          return { count };
        })
      )
);
