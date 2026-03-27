import { platform } from "node:os";
import { relative } from "node:path";

import chokidar from "chokidar";
import { ServiceMap } from "effect";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import type * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EventType = "todos" | "reviews" | "comments" | "files";

export interface SSEEvent {
  readonly type: EventType;
  readonly data?: unknown;
  readonly timestamp: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class EventService extends ServiceMap.Service<
  EventService,
  {
    broadcast(type: EventType, data?: unknown): Effect.Effect<void>;
    subscribe(): Effect.Effect<{
      readonly stream: Stream.Stream<SSEEvent>;
      readonly unsubscribe: Effect.Effect<void>;
    }>;
    startFileWatcher(
      repoPath: string
    ): Effect.Effect<ReturnType<typeof chokidar.watch>, never, Scope.Scope>;
    getClientCount(): Effect.Effect<number>;
  }
>()("@ringi/EventService") {
  static readonly Default: Layer.Layer<EventService> = Layer.effect(
    EventService,
    Effect.sync(() => {
      const subscribers = new Set<Queue.Queue<SSEEvent>>();

      const broadcast = (type: EventType, data?: unknown) =>
        Effect.gen(function* () {
          const event: SSEEvent = { data, timestamp: Date.now(), type };
          for (const queue of subscribers) {
            yield* Queue.offer(queue, event);
          }
        });

      const subscribe = () =>
        Effect.gen(function* () {
          const queue = yield* Queue.sliding<SSEEvent>(100);
          subscribers.add(queue);

          const stream = Stream.fromQueue(queue);

          const unsubscribe = Effect.sync(() => {
            subscribers.delete(queue);
          }).pipe(Effect.andThen(Queue.shutdown(queue)));

          return { stream, unsubscribe } as const;
        });

      const startFileWatcher = (repoPath: string) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            let debounceTimer: ReturnType<typeof setTimeout> | null = null;

            const watcher = chokidar.watch(repoPath, {
              ignoreInitial: true,
              ignored: [
                "**/node_modules/**",
                "**/.git/**",
                "**/.ringi/**",
                "**/dist/**",
              ],
              persistent: true,
              ...(platform() === "darwin"
                ? { interval: 1000, usePolling: true }
                : {}),
            });

            const debouncedBroadcast = (filePath: string) => {
              if (debounceTimer) {
                clearTimeout(debounceTimer);
              }
              debounceTimer = setTimeout(() => {
                const rel = relative(repoPath, filePath);
                Effect.runFork(broadcast("files", { path: rel }));
              }, 300);
            };

            watcher.on("add", debouncedBroadcast);
            watcher.on("change", debouncedBroadcast);
            watcher.on("unlink", debouncedBroadcast);

            return watcher;
          }),
          (watcher) => Effect.promise(() => watcher.close())
        );

      const getClientCount = () => Effect.sync(() => subscribers.size);

      return EventService.of({
        broadcast,
        getClientCount,
        startFileWatcher,
        subscribe,
      });
    })
  );
}
