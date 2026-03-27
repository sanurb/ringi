import { EventService } from "@ringi/core/services/event.service";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";

const encoder = new TextEncoder();

const encodeSSE = (payload: string): Uint8Array =>
  encoder.encode(`data: ${payload}\n\n`);

const CONNECTED_COMMENT: Uint8Array = encoder.encode(": connected\n\n");
const HEARTBEAT_COMMENT: Uint8Array = encoder.encode(": ping\n\n");

/** Emits a `: ping` SSE comment every 30 seconds to keep the connection alive. */
const heartbeat: Stream.Stream<Uint8Array> = Stream.tick("30 seconds").pipe(
  Stream.map((): Uint8Array => HEARTBEAT_COMMENT)
);

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

        const eventStream = stream.pipe(
          Stream.map((event): Uint8Array => encodeSSE(JSON.stringify(event)))
        );

        // Merge real events with periodic heartbeat keepalives,
        // prepend the initial `: connected` comment, and clean up
        // the subscription when the stream terminates.
        const fullStream = Stream.make(CONNECTED_COMMENT).pipe(
          Stream.concat(Stream.merge(eventStream, heartbeat)),
          Stream.ensuring(unsubscribe)
        );

        return HttpServerResponse.stream(fullStream, {
          contentType: "text/event-stream",
          headers: {
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      }).pipe(Effect.withSpan("SSE.events"))
    );
  })
);
