import { platform } from "node:os";
import { relative } from "node:path";

import chokidar from "chokidar";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Runtime from "effect/Runtime";
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

export class EventService extends Effect.Service<EventService>()(
  "@ringi/EventService",
  {
    effect: Effect.gen(function* effect() {
      const rt = yield* Effect.runtime<never>();
      const runFork = Runtime.runFork(rt);
      const subscribers = new Set<Queue.Queue<SSEEvent>>();

      // -- broadcast ---------------------------------------------------------

      const broadcast = Effect.fn("EventService.broadcast")(function* broadcast(
        type: EventType,
        data?: unknown
      ) {
        const event: SSEEvent = { data, timestamp: Date.now(), type };
        for (const queue of subscribers) {
          yield* Queue.offer(queue, event);
        }
      });

      // -- subscribe ---------------------------------------------------------

      const subscribe = Effect.fn("EventService.subscribe")(
        function* subscribe() {
          const queue = yield* Queue.sliding<SSEEvent>(100);
          subscribers.add(queue);

          const stream = Stream.fromQueue(queue);

          const unsubscribe = Effect.sync(() => {
            subscribers.delete(queue);
          }).pipe(Effect.andThen(Queue.shutdown(queue)));

          return { stream, unsubscribe } as const;
        }
      );

      // -- file watcher ------------------------------------------------------

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
                runFork(broadcast("files", { path: rel }));
              }, 300);
            };

            watcher.on("add", debouncedBroadcast);
            watcher.on("change", debouncedBroadcast);
            watcher.on("unlink", debouncedBroadcast);

            return watcher;
          }),
          (watcher) => Effect.promise(() => watcher.close())
        );

      // -- client count ------------------------------------------------------

      const getClientCount = () => Effect.sync(() => subscribers.size);

      return {
        broadcast,
        getClientCount,
        startFileWatcher,
        subscribe,
      } as const;
    }),
  }
) {}
