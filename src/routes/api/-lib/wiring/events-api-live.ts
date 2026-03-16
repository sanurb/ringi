import * as HttpApiBuilder from "@effect/platform/HttpApiBuilder";
import * as Effect from "effect/Effect";

import { DomainApi } from "@/api/domain-api";
import { EventService } from "../services/event.service";

export const EventsApiLive = HttpApiBuilder.group(
  DomainApi,
  "events",
  (handlers) =>
    handlers
      .handle("notify", (_) =>
        Effect.gen(function* () {
          const events = yield* EventService;
          yield* events.broadcast(_.payload.type, {
            action: _.payload.action,
          });
          return { success: true as const };
        }),
      )
      .handle("clients", (_) =>
        Effect.gen(function* () {
          const events = yield* EventService;
          const count = yield* events.getClientCount();
          return { count };
        }),
      ),
);
