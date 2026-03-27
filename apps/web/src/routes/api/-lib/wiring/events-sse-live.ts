import { EventService } from "@ringi/core/services/event.service";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";

const encoder = new TextEncoder();

const encodeSSE = (payload: string): Uint8Array =>
  encoder.encode(`data: ${payload}\n\n`);

const CONNECTED_COMMENT: Uint8Array = encoder.encode(": connected\n\n");

/**
 * SSE endpoint: GET /api/events
 *
 * Returns a `text/event-stream` response that pushes structured events
 * from the EventService subscription. The connection stays open until the
 * client disconnects.
 *
 * Uses `HttpRouter.use` because SSE streaming cannot be expressed as a
 * standard request/response HttpApiEndpoint — it needs a raw route that
 * returns a long-lived streaming response.
 */
export const EventsSseLive = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const events = yield* EventService;

    yield* router.add(
      "GET",
      "/api/events",
      Effect.gen(function* () {
        const { stream, unsubscribe } = yield* events.subscribe();

        const sseStream = stream.pipe(
          Stream.map((event): Uint8Array => encodeSSE(JSON.stringify(event))),
          Stream.ensuring(unsubscribe)
        );

        const fullStream = Stream.make(CONNECTED_COMMENT).pipe(
          Stream.concat(sseStream)
        );

        return HttpServerResponse.stream(fullStream, {
          contentType: "text/event-stream",
          headers: {
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      })
    );
  })
);
