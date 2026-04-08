import { DomainApi } from "@ringi/core/api/domain-api";
import { DomainRpc } from "@ringi/core/api/domain-rpc";
import { ObservabilityLive } from "@ringi/core/observability/observability-layer";
import { CoreLive } from "@ringi/core/runtime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpRouter, HttpServer } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";

import { AnnotationsApiLive } from "./wiring/annotations-api-live";
import { CommentsApiLive } from "./wiring/comments-api-live";
import { ContextApiLive } from "./wiring/context-api-live";
import { CoverageApiLive } from "./wiring/coverage-api-live";
import { DiffApiLive, ReviewFilesApiLive } from "./wiring/diff-api-live";
import { EventsApiLive } from "./wiring/events-api-live";
import { EventsSseLive } from "./wiring/events-sse-live";
import { ExportApiLive } from "./wiring/export-api-live";
import { GitApiLive } from "./wiring/git-api-live";
import { HealthApiLive } from "./wiring/health-api-live";
import { ReviewsApiLive } from "./wiring/reviews-api-live";
import { ReviewsRpcLive } from "./wiring/reviews-rpc-live";
import { TodosApiLive } from "./wiring/todos-api-live";

// ── Shared service layers ───────────────────────────────────────
const ServiceLayers = CoreLive;

// ── Routes ──────────────────────────────────────────────────────
const RpcRouter = RpcServer.layerHttp({
  group: DomainRpc,
  path: "/api/rpc",
  spanPrefix: "rpc",
}).pipe(
  Layer.provide(ReviewsRpcLive),
  Layer.provide(RpcSerialization.layerNdjson)
);

const HttpApiRoutes = HttpApiBuilder.layer(DomainApi).pipe(
  Layer.provide(ReviewsApiLive),
  Layer.provide(CommentsApiLive),
  Layer.provide(TodosApiLive),
  Layer.provide(AnnotationsApiLive),
  Layer.provide(CoverageApiLive),
  Layer.provide(ContextApiLive),
  Layer.provide(DiffApiLive),
  Layer.provide(ReviewFilesApiLive),
  Layer.provide(GitApiLive),
  Layer.provide(EventsApiLive),
  Layer.provide(ExportApiLive),
  Layer.provide(HealthApiLive),
  Layer.provide(HttpServer.layerServices)
);

const AllRoutes = Layer.mergeAll(RpcRouter, HttpApiRoutes, EventsSseLive).pipe(
  Layer.provide(ServiceLayers),
  Layer.provide(ObservabilityLive("server"))
);

// ── Initialization ──────────────────────────────────────────────

/**
 * Initialize the Effect HTTP + RPC handler.
 * Called lazily on first API request to avoid blocking SSR module evaluation.
 */
export const initApiHandler = async () => {
  const memoMap = Effect.runSync(Layer.makeMemoMap);

  const { handler, dispose: disposeHandler } = HttpRouter.toWebHandler(
    AllRoutes,
    { memoMap }
  );

  const { serverRuntime } = await import("./server-runtime");

  const dispose = async () => {
    await disposeHandler();
    await serverRuntime.dispose();
  };

  return { handler, dispose };
};
