import * as Effect from "effect/Effect";
import * as Runtime from "effect/Runtime";
import * as Stream from "effect/Stream";
import * as Queue from "effect/Queue";
import chokidar from "chokidar";
import { relative } from "node:path";
import { platform } from "node:os";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EventType = "todos" | "reviews" | "comments" | "files";

export interface SSEEvent {
  type: EventType;
  data?: unknown;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/** @effect-leakable-service */
export class EventService extends Effect.Service<EventService>()(
  "EventService",
  {
    effect: Effect.gen(function* () {
      const rt = yield* Effect.runtime<never>();
      const runFork = Runtime.runFork(rt);
      const subscribers = new Set<Queue.Queue<SSEEvent>>();

      // -- broadcast ---------------------------------------------------------

      const broadcast = (type: EventType, data?: unknown) =>
        Effect.gen(function* () {
          const event: SSEEvent = { type, data, timestamp: Date.now() };
          for (const queue of subscribers) {
            yield* Queue.offer(queue, event);
          }
        });

      // -- subscribe ---------------------------------------------------------

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

      // -- file watcher ------------------------------------------------------

      const startFileWatcher = (repoPath: string) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            let debounceTimer: ReturnType<typeof setTimeout> | null = null;

            const watcher = chokidar.watch(repoPath, {
              ignored: [
                "**/node_modules/**",
                "**/.git/**",
                "**/.ringi/**",
                "**/dist/**",
              ],
              persistent: true,
              ignoreInitial: true,
              ...(platform() === "darwin"
                ? { usePolling: true, interval: 1000 }
                : {}),
            });

            const debouncedBroadcast = (filePath: string) => {
              if (debounceTimer) clearTimeout(debounceTimer);
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
          (watcher) =>
            Effect.promise(() => watcher.close()),
        );

      // -- client count ------------------------------------------------------

      const getClientCount = () => Effect.sync(() => subscribers.size);

      return {
        broadcast,
        subscribe,
        startFileWatcher,
        getClientCount,
      } as const;
    }),
  },
) {}
