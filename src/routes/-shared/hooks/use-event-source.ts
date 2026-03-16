import { useState, useEffect, useRef } from "react";

export type EventType = "todos" | "reviews" | "comments" | "files";

export interface SSEEvent {
  type: EventType;
  data?: unknown;
  timestamp: number;
}

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

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const es = new EventSource(url);

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as SSEEvent;
        onEventRef.current?.(data);
      } catch {
        // ignore malformed messages
      }
    };

    return () => {
      es.close();
      setConnected(false);
    };
  }, [url, enabled]);

  return { connected };
}
