import { createFileRoute } from "@tanstack/react-router";
import * as HttpServerResponse from "@effect/platform/HttpServerResponse";
import * as HttpServer from "@effect/platform/HttpServer";
import * as HttpLayerRouter from "@effect/platform/HttpLayerRouter";
import * as RpcSerialization from "@effect/rpc/RpcSerialization";
import * as RpcServer from "@effect/rpc/RpcServer";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Logger from "effect/Logger";
import * as Stream from "effect/Stream";
import * as RpcMiddleware from "@effect/rpc/RpcMiddleware";

import { DomainRpc } from "@/api/domain-rpc";
import { DomainApi } from "@/api/domain-api";
import { ReviewsRpcLive } from "./-lib/wiring/reviews-rpc-live";
import { ReviewsApiLive } from "./-lib/wiring/reviews-api-live";
import { CommentsApiLive } from "./-lib/wiring/comments-api-live";
import { TodosApiLive } from "./-lib/wiring/todos-api-live";
import { DiffApiLive, ReviewFilesApiLive } from "./-lib/wiring/diff-api-live";
import { GitApiLive } from "./-lib/wiring/git-api-live";
import { EventsApiLive } from "./-lib/wiring/events-api-live";
import { ExportApiLive } from "./-lib/wiring/export-api-live";
import { SqliteService } from "./-lib/db/database";
import { ReviewService } from "./-lib/services/review.service";
import { CommentService } from "./-lib/services/comment.service";
import { TodoService } from "./-lib/services/todo.service";
import { ReviewRepo } from "./-lib/repos/review.repo";
import { ReviewFileRepo } from "./-lib/repos/review-file.repo";
import { CommentRepo } from "./-lib/repos/comment.repo";
import { TodoRepo } from "./-lib/repos/todo.repo";
import { GitService } from "./-lib/services/git.service";
import { EventService } from "./-lib/services/event.service";
import { ExportService } from "./-lib/services/export.service";

// ── RPC logger middleware ───────────────────────────────────────
class RpcLogger extends RpcMiddleware.Tag<RpcLogger>()("RpcLogger", {
  wrap: true,
  optional: true,
}) {}

const RpcLoggerLive = Layer.succeed(
  RpcLogger,
  RpcLogger.of((opts) =>
    Effect.flatMap(Effect.exit(opts.next), (exit) =>
      Exit.match(exit, {
        onSuccess: () => exit,
        onFailure: (cause) =>
          Effect.zipRight(
            Effect.annotateLogs(
              Effect.logError(`RPC request failed: ${opts.rpc._tag}`, cause),
              { "rpc.method": opts.rpc._tag, "rpc.clientId": opts.clientId },
            ),
            exit,
          ),
      }),
    ),
  ),
);

// ── Shared service layers ───────────────────────────────────────
// ReviewService methods leak ReviewRepo, ReviewFileRepo, GitService as
// runtime requirements (accessed via yield* inside each method). We provide
// them once here so both HTTP and RPC routers share the same instances.
const ServiceLayers = Layer.mergeAll(
  ReviewService.Default,
  ReviewRepo.Default,
  ReviewFileRepo.Default,
  CommentService.Default,
  CommentRepo.Default,
  TodoService.Default,
  TodoRepo.Default,
  GitService.Default,
  EventService.Default,
  ExportService.Default,
  SqliteService.Default,
);

// ── Routes ──────────────────────────────────────────────────────
const RpcRouter = RpcServer.layerHttpRouter({
  group: DomainRpc.middleware(RpcLogger),
  path: "/api/rpc",
  protocol: "http",
  spanPrefix: "rpc",
  disableFatalDefects: true,
}).pipe(
  Layer.provide(ReviewsRpcLive),
  Layer.provide(RpcLoggerLive),
  Layer.provide(RpcSerialization.layerNdjson),
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
  Layer.provide(HttpServer.layerContext),
);

const HealthRoute = HttpLayerRouter.use((router) =>
  router.add("GET", "/api/health", HttpServerResponse.text("OK")),
);

const SSERoute = HttpLayerRouter.use((router) =>
  router.add(
    "GET",
    "/api/events",
    Effect.gen(function* () {
      const eventService = yield* EventService;
      const { stream, unsubscribe: _unsubscribe } = yield* eventService.subscribe();

      const body = stream.pipe(
        Stream.map((event) => `data: ${JSON.stringify(event)}\n\n`),
        Stream.encodeText,
      );

      return HttpServerResponse.stream(body, {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        },
      });
    }).pipe(Effect.provide(EventService.Default)),
  ),
);

const AllRoutes = Layer.mergeAll(RpcRouter, HttpApiRouter, HealthRoute, SSERoute).pipe(
  Layer.provide(ServiceLayers),
  Layer.provide(Logger.pretty),
);

// ── Runtime ─────────────────────────────────────────────────────
const memoMap = Effect.runSync(Layer.makeMemoMap);

const globalHmr = globalThis as unknown as {
  __EFFECT_DISPOSE__?: () => Promise<void>;
};
if (globalHmr.__EFFECT_DISPOSE__) {
  await globalHmr.__EFFECT_DISPOSE__();
  globalHmr.__EFFECT_DISPOSE__ = undefined;
}

const { handler, dispose } = HttpLayerRouter.toWebHandler(AllRoutes, { memoMap });
const effectHandler = ({ request }: { request: Request }) => handler(request);

export const serverRuntime = ManagedRuntime.make(ServiceLayers, memoMap);

globalHmr.__EFFECT_DISPOSE__ = async () => {
  await dispose();
  await serverRuntime.dispose();
};

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: effectHandler,
      POST: effectHandler,
      PUT: effectHandler,
      PATCH: effectHandler,
      DELETE: effectHandler,
      OPTIONS: effectHandler,
    },
  },
});
