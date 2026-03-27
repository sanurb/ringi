import { DomainApi } from "@ringi/core/api/domain-api";
import { DomainRpc } from "@ringi/core/api/domain-rpc";
import { ServiceMap } from "effect";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";
import { FetchHttpClient, HttpClient } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { RpcClient, RpcSerialization } from "effect/unstable/rpc";

export const addRpcErrorLogging = <Client>(client: Client): Client => {
  const wrapCall = <F extends (...args: never[]) => unknown>(
    fn: F,
    path: readonly string[]
  ): F => {
    const rpcId = path.join(".");
    const logCause = (cause: unknown) =>
      Effect.logError(`[API] ${rpcId} failed`, cause);

    return function wrappedCall(
      this: ThisParameterType<F>,
      ...args: Parameters<F>
    ): ReturnType<F> {
      const result = fn.apply(this, args);
      if (Effect.isEffect(result)) {
        return result.pipe(Effect.tapCause(logCause)) as ReturnType<F>;
      }
      if (Stream.isStream(result)) {
        return result.pipe(Stream.tapCause(logCause)) as ReturnType<F>;
      }
      return result as ReturnType<F>;
    } as F;
  };

  const visit = (node: unknown, path: readonly string[]) => {
    if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        const nextPath = [...path, key];
        if (typeof value === "function") {
          (node as Record<string, unknown>)[key] = wrapCall(value, nextPath);
          continue;
        }
        visit(value, nextPath);
      }
    }
    return node;
  };

  return visit(client, []) as Client;
};

const getBaseUrl = (): string =>
  typeof window === "undefined"
    ? "http://localhost:3000"
    : window.location.origin;

const RpcConfigLive = RpcClient.layerProtocolHttp({
  url: `${getBaseUrl()}/api/rpc`,
}).pipe(Layer.provide([FetchHttpClient.layer, RpcSerialization.layerNdjson]));

export class ApiClient extends ServiceMap.Service<
  ApiClient,
  {
    readonly http: any;
    readonly rpc: any;
  }
>()("ApiClient") {
  static readonly Default: Layer.Layer<ApiClient> = Layer.effect(
    ApiClient,
    Effect.gen(function* () {
      const rpcClient = yield* RpcClient.make(DomainRpc);

      const httpClient = yield* HttpApiClient.make(DomainApi, {
        baseUrl: getBaseUrl(),
        transformClient: (client: any) =>
          client.pipe(
            HttpClient.filterStatusOk,
            HttpClient.retryTransient({
              schedule: Schedule.exponential("1 second"),
              times: 3,
            })
          ),
      });

      return ApiClient.of({
        http: httpClient,
        rpc: addRpcErrorLogging(rpcClient),
      });
    })
  ).pipe(Layer.provide(RpcConfigLive), Layer.provide(FetchHttpClient.layer));
}
