/**
 * LocalFileTracer — custom Effect Tracer that persists completed spans
 * as NDJSON records via TraceSink.
 *
 * Wraps each span in a `LocalFileSpan` that mirrors all attribute/event
 * mutations to the delegate span AND records them locally. On `end()`,
 * the span is serialized and pushed to the sink.
 *
 * When OTLP is enabled, the delegate is an OtlpTracer span. When OTLP
 * is disabled, the delegate is a plain NativeSpan.
 */

import * as Effect from "effect/Effect";
import type * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Tracer from "effect/Tracer";

import type { EffectTraceRecord } from "./trace-record";
import { spanToTraceRecord } from "./trace-record";
import type { TraceSink } from "./trace-sink";
import { makeTraceSink } from "./trace-sink";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface LocalFileTracerOptions {
  readonly filePath: string;
  readonly maxBytes: number;
  readonly maxFiles: number;
  readonly batchWindowMs: number;
  /** Optional delegate tracer (e.g. OtlpTracer). Falls back to NativeSpan. */
  readonly delegate?: Tracer.Tracer;
  /** Optional pre-built sink (for sharing between tracer and other consumers). */
  readonly sink?: TraceSink;
}

// ---------------------------------------------------------------------------
// Span wrapper
// ---------------------------------------------------------------------------

class LocalFileSpan implements Tracer.Span {
  readonly _tag = "Span" as const;
  readonly name: string;
  readonly spanId: string;
  readonly traceId: string;
  readonly parent: Option.Option<Tracer.AnySpan>;
  readonly annotations: Tracer.Span["annotations"];
  readonly links: Array<Tracer.SpanLink>;
  readonly sampled: boolean;
  readonly kind: Tracer.SpanKind;

  status: Tracer.SpanStatus;
  attributes: Map<string, unknown>;
  events: Array<
    [name: string, startTime: bigint, attributes: Record<string, unknown>]
  >;

  constructor(
    options: Parameters<Tracer.Tracer["span"]>[0],
    private readonly delegateSpan: Tracer.Span,
    private readonly push: (record: EffectTraceRecord) => void
  ) {
    this.name = delegateSpan.name;
    this.spanId = delegateSpan.spanId;
    this.traceId = delegateSpan.traceId;
    this.parent = options.parent;
    this.annotations = options.annotations;
    this.links = [...options.links];
    this.sampled = delegateSpan.sampled;
    this.kind = delegateSpan.kind;
    this.status = { _tag: "Started", startTime: options.startTime };
    this.attributes = new Map();
    this.events = [];
  }

  end(endTime: bigint, exit: Exit.Exit<unknown, unknown>): void {
    this.status = {
      _tag: "Ended",
      startTime: this.status.startTime,
      endTime,
      exit,
    };
    this.delegateSpan.end(endTime, exit);

    if (this.sampled) {
      this.push(spanToTraceRecord(this));
    }
  }

  attribute(key: string, value: unknown): void {
    this.attributes.set(key, value);
    this.delegateSpan.attribute(key, value);
  }

  event(
    name: string,
    startTime: bigint,
    attributes?: Record<string, unknown>
  ): void {
    const nextAttributes = attributes ?? {};
    this.events.push([name, startTime, nextAttributes]);
    this.delegateSpan.event(name, startTime, nextAttributes);
  }

  addLinks(links: ReadonlyArray<Tracer.SpanLink>): void {
    this.links.push(...links);
    this.delegateSpan.addLinks(links);
  }
}

// ---------------------------------------------------------------------------
// Tracer factory
// ---------------------------------------------------------------------------

export const makeLocalFileTracer = Effect.fn("makeLocalFileTracer")(function* (
  options: LocalFileTracerOptions
) {
  const sink =
    options.sink ??
    (yield* makeTraceSink({
      filePath: options.filePath,
      maxBytes: options.maxBytes,
      maxFiles: options.maxFiles,
      batchWindowMs: options.batchWindowMs,
    }));

  const delegate =
    options.delegate ??
    Tracer.make({
      span: (spanOptions) => new Tracer.NativeSpan(spanOptions),
    });

  return Tracer.make({
    span(spanOptions) {
      return new LocalFileSpan(
        spanOptions,
        delegate.span(spanOptions),
        sink.push
      );
    },
    ...(delegate.context ? { context: delegate.context } : {}),
  });
});
