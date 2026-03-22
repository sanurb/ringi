import * as HttpLayerRouter from "@effect/platform/HttpLayerRouter";
import * as HttpServer from "@effect/platform/HttpServer";
import * as HttpServerResponse from "@effect/platform/HttpServerResponse";
import * as RpcMiddleware from "@effect/rpc/RpcMiddleware";
import * as RpcSerialization from "@effect/rpc/RpcSerialization";
import * as RpcServer from "@effect/rpc/RpcServer";
import { createFileRoute } from "@tanstack/react-router";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Stream from "effect/Stream";

import { DomainApi } from "@/api/domain-api";
import { DomainRpc } from "@/api/domain-rpc";
import { CoreLive, createCoreRuntime } from "@/core/runtime";
import { EventService } from "@/core/services/event.service";

import { CommentsApiLive } from "./-lib/wiring/comments-api-live";
import { DiffApiLive, ReviewFilesApiLive } from "./-lib/wiring/diff-api-live";
import { EventsApiLive } from "./-lib/wiring/events-api-live";
import { ExportApiLive } from "./-lib/wiring/export-api-live";
import { GitApiLive } from "./-lib/wiring/git-api-live";
import { ReviewsApiLive } from "./-lib/wiring/reviews-api-live";
import { ReviewsRpcLive } from "./-lib/wiring/reviews-rpc-live";
import { TodosApiLive } from "./-lib/wiring/todos-api-live";

// ── RPC logger middleware ───────────────────────────────────────
class RpcLogger extends RpcMiddleware.Tag<RpcLogger>()("RpcLogger", {
  optional: true,
  wrap: true,
}) {}

const RpcLoggerLive = Layer.succeed(
  RpcLogger,
  RpcLogger.of((opts) =>
    Effect.flatMap(Effect.exit(opts.next), (exit) =>
      Exit.match(exit, {
        onFailure: (cause) =>
          Effect.zipRight(
            Effect.annotateLogs(
              Effect.logError(`RPC request failed: ${opts.rpc._tag}`, cause),
              { "rpc.clientId": opts.clientId, "rpc.method": opts.rpc._tag }
            ),
            exit
          ),
        onSuccess: () => exit,
      })
    )
  )
);

// ── Shared service layers ───────────────────────────────────────
// HTTP and RPC adapters share the same core composition root used by other
// runtimes so server wiring does not own business-layer construction.
const ServiceLayers = CoreLive;

// ── Routes ──────────────────────────────────────────────────────
const RpcRouter = RpcServer.layerHttpRouter({
  disableFatalDefects: true,
  group: DomainRpc.middleware(RpcLogger),
  path: "/api/rpc",
  protocol: "http",
  spanPrefix: "rpc",
}).pipe(
  Layer.provide(ReviewsRpcLive),
  Layer.provide(RpcLoggerLive),
  Layer.provide(RpcSerialization.layerNdjson)
);

const HttpApiRouter = HttpLayerRouter.addHttpApi(DomainApi).pipe(
  Layer.provide(ReviewsApiLive),
  Layer.provide(CommentsApiLive),
  Layer.provide(TodosApiLive),
  Layer.provide(DiffApiLive),
  Layer.provide(ReviewFilesApiLive),
  Layer.provide(GitApiLive),
  Layer.provide(EventsApiLive),
  Layer.provide(ExportApiLive),
  Layer.provide(HttpServer.layerContext)
);

const HealthRoute = HttpLayerRouter.use((router) =>
  router.add("GET", "/api/health", HttpServerResponse.text("OK"))
);

const SSERoute = HttpLayerRouter.use((router) =>
  router.add(
    "GET",
    "/api/events",
    Effect.gen(function* SSERoute() {
      const eventService = yield* EventService;
      const { stream, unsubscribe: _unsubscribe } =
        yield* eventService.subscribe();

      const body = stream.pipe(
        Stream.map((event) => `data: ${JSON.stringify(event)}\n\n`),
        Stream.encodeText
      );

      return HttpServerResponse.stream(body, {
        headers: {
          "cache-control": "no-cache",
          connection: "keep-alive",
          "content-type": "text/event-stream",
        },
      });
    }).pipe(Effect.provide(EventService.Default))
  )
);

const AllRoutes = Layer.mergeAll(
  RpcRouter,
  HttpApiRouter,
  HealthRoute,
  SSERoute
).pipe(Layer.provide(ServiceLayers), Layer.provide(Logger.pretty));

// ── Runtime ─────────────────────────────────────────────────────
const memoMap = Effect.runSync(Layer.makeMemoMap);

const globalHmr = globalThis as unknown as {
  __EFFECT_DISPOSE__?: () => Promise<void>;
};
if (globalHmr.__EFFECT_DISPOSE__) {
  await globalHmr.__EFFECT_DISPOSE__();
  globalHmr.__EFFECT_DISPOSE__ = undefined;
}

const { handler, dispose } = HttpLayerRouter.toWebHandler(AllRoutes, {
  memoMap,
});
const effectHandler = ({ request }: { request: Request }) => handler(request);

export const serverRuntime = createCoreRuntime();

globalHmr.__EFFECT_DISPOSE__ = async () => {
  await dispose();
  await serverRuntime.dispose();
};

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      DELETE: effectHandler,
      GET: effectHandler,
      OPTIONS: effectHandler,
      PATCH: effectHandler,
      POST: effectHandler,
      PUT: effectHandler,
    },
  },
});
