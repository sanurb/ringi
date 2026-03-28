/**
 * HTTP client for server-connected CLI commands.
 *
 * Uses Node's native `fetch` — no extra dependencies. All operations return
 * Effects with typed errors from `./errors.ts`.
 */
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

import { ServerConnectionError, ServerResponseError } from "@/cli/cli-errors";

export { ServerConnectionError, ServerResponseError } from "@/cli/cli-errors";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Base URL for the running Ringi server. Configurable via `RINGI_SERVER_URL`. */
export const ServerUrl = Config.string("RINGI_SERVER_URL").pipe(
  Config.withDefault("http://localhost:3000")
);

export interface ServerClientConfig {
  readonly baseUrl: string;
}

// ---------------------------------------------------------------------------
// SSE types
// ---------------------------------------------------------------------------

export interface SSEEvent {
  readonly data?: unknown;
  readonly timestamp: number;
  readonly type: "comments" | "files" | "reviews" | "todos";
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

const serverFetch = (
  baseUrl: string,
  path: string,
  init?: RequestInit
): Effect.Effect<Response, ServerConnectionError> =>
  Effect.tryPromise({
    catch: (error) =>
      new ServerConnectionError({
        reason: error instanceof Error ? error.message : "Connection refused",
        url: baseUrl,
      }),
    try: () => fetch(`${baseUrl}${path}`, init),
  });

const ensureOk = (
  response: Response
): Effect.Effect<Response, ServerResponseError> =>
  response.ok
    ? Effect.succeed(response)
    : Effect.tryPromise({
        catch: () =>
          new ServerResponseError({
            body: "",
            status: response.status,
            statusText: response.statusText,
          }),
        try: () => response.text(),
      }).pipe(
        Effect.flatMap((body) =>
          Effect.fail(
            new ServerResponseError({
              body,
              status: response.status,
              statusText: response.statusText,
            })
          )
        )
      );

// ---------------------------------------------------------------------------
// JSON API methods — all return Effects
// ---------------------------------------------------------------------------

const resolveBaseUrl = (input: string | ServerClientConfig): string =>
  typeof input === "string" ? input : input.baseUrl;

export const serverGet = <T>(
  input: string | ServerClientConfig,
  path: string
): Effect.Effect<T, ServerConnectionError | ServerResponseError> =>
  serverFetch(resolveBaseUrl(input), path, {
    headers: { Accept: "application/json" },
  }).pipe(
    Effect.flatMap(ensureOk),
    Effect.flatMap((r) =>
      Effect.tryPromise({
        catch: () =>
          new ServerResponseError({
            body: "Invalid JSON",
            status: r.status,
            statusText: r.statusText,
          }),
        try: () => r.json() as Promise<T>,
      })
    )
  );

export const serverPost = <T>(
  input: string | ServerClientConfig,
  path: string,
  body?: unknown
): Effect.Effect<T, ServerConnectionError | ServerResponseError> =>
  serverFetch(resolveBaseUrl(input), path, {
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
  }).pipe(
    Effect.flatMap(ensureOk),
    Effect.flatMap((r) =>
      Effect.tryPromise({
        catch: () =>
          new ServerResponseError({
            body: "Invalid JSON",
            status: r.status,
            statusText: r.statusText,
          }),
        try: () => r.json() as Promise<T>,
      })
    )
  );

export const serverPatch = <T>(
  input: string | ServerClientConfig,
  path: string,
  body: unknown
): Effect.Effect<T, ServerConnectionError | ServerResponseError> =>
  serverFetch(resolveBaseUrl(input), path, {
    body: JSON.stringify(body),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "PATCH",
  }).pipe(
    Effect.flatMap(ensureOk),
    Effect.flatMap((r) =>
      Effect.tryPromise({
        catch: () =>
          new ServerResponseError({
            body: "Invalid JSON",
            status: r.status,
            statusText: r.statusText,
          }),
        try: () => r.json() as Promise<T>,
      })
    )
  );

export const serverDelete = <T>(
  input: string | ServerClientConfig,
  path: string
): Effect.Effect<T, ServerConnectionError | ServerResponseError> =>
  serverFetch(resolveBaseUrl(input), path, {
    headers: { Accept: "application/json" },
    method: "DELETE",
  }).pipe(
    Effect.flatMap(ensureOk),
    Effect.flatMap((r) =>
      Effect.tryPromise({
        catch: () =>
          new ServerResponseError({
            body: "Invalid JSON",
            status: r.status,
            statusText: r.statusText,
          }),
        try: () => r.json() as Promise<T>,
      })
    )
  );

// ---------------------------------------------------------------------------
// SSE stream consumer
// ---------------------------------------------------------------------------

/**
 * Connects to the server's SSE endpoint and yields parsed events.
 *
 * Uses native `fetch` with a streaming `ReadableStream` reader —
 * no `EventSource` polyfill needed.
 *
 * @yields Parsed SSE events from the server.
 */
export async function* streamSSE(
  input: string | ServerClientConfig,
  options?: { type?: string }
): AsyncGenerator<SSEEvent, void, undefined> {
  const baseUrl = resolveBaseUrl(input);
  const response = await fetch(`${baseUrl}/api/events`, {
    headers: { Accept: "text/event-stream" },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ServerResponseError({
      body,
      status: response.status,
      statusText: response.statusText,
    });
  }

  const body = response.body;
  if (!body) return;

  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        if (frame.startsWith(":")) continue;

        const dataLine = frame
          .split("\n")
          .find((line) => line.startsWith("data: "));
        if (!dataLine) continue;

        const json = dataLine.slice(6);
        try {
          const event = JSON.parse(json) as SSEEvent;
          if (options?.type && event.type !== options.type) continue;
          yield event;
        } catch {
          // Malformed JSON — skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export const checkServerHealth = (
  input: string | ServerClientConfig
): Effect.Effect<boolean> =>
  serverFetch(resolveBaseUrl(input), "/api/events/clients").pipe(
    Effect.map((r) => r.ok),
    Effect.catch(() => Effect.succeed(false))
  );
