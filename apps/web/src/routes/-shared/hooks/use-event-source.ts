import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { useState, useEffect, useRef } from "react";

export type EventType = "todos" | "reviews" | "comments" | "files";

export interface SSEEvent {
  type: EventType;
  data?: unknown;
  timestamp: number;
}

const decodeSSEEvent = Schema.decodeUnknownOption(
  Schema.parseJson(
    Schema.Struct({
      data: Schema.optional(Schema.Unknown),
      timestamp: Schema.Number,
      type: Schema.Literal("todos", "reviews", "comments", "files"),
    })
  )
);

interface UseEventSourceOptions {
  url?: string;
  onEvent?: (event: SSEEvent) => void;
  enabled?: boolean;
}

export function useEventSource(options: UseEventSourceOptions = {}) {
  const { url = "/api/events", onEvent, enabled = true } = options;
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    function connect() {
      const es = new EventSource(url);
      esRef.current = es;

      es.onopen = () => setConnected(true);

      es.onerror = () => {
        setConnected(false);
        es.close();
        esRef.current = null;
        // Reconnect after 1s unless cleanup has run
        if (reconnectTimeoutRef.current === null) {
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            connect();
          }, 1000);
        }
      };

      es.onmessage = (event) => {
        Option.map(decodeSSEEvent(event.data), (data) =>
          onEventRef.current?.(data)
        );
      };
    }

    connect();

    return () => {
      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      esRef.current?.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [url, enabled]);

  return { connected };
}
