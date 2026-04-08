/**
 * Trace record schema — the shape of each NDJSON line in the local trace file.
 *
 * One completed Effect span becomes one `EffectTraceRecord`. The fields mirror
 * OpenTelemetry conventions where practical so records are meaningful both
 * locally (jq) and when exported via OTLP.
 */

import * as Cause from "effect/Cause";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import type * as Tracer from "effect/Tracer";

import { compactTraceAttributes } from "./attributes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TraceRecordEvent {
  readonly name: string;
  readonly timeUnixNano: string;
  readonly attributes: Readonly<Record<string, unknown>>;
}

interface TraceRecordLink {
  readonly traceId: string;
  readonly spanId: string;
  readonly attributes: Readonly<Record<string, unknown>>;
}

export interface EffectTraceRecord {
  readonly type: "effect-span";
  readonly name: string;
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly sampled: boolean;
  readonly kind: string;
  readonly startTimeUnixNano: string;
  readonly endTimeUnixNano: string;
  readonly durationMs: number;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly events: ReadonlyArray<TraceRecordEvent>;
  readonly links: ReadonlyArray<TraceRecordLink>;
  readonly exit:
    | { readonly _tag: "Success" }
    | { readonly _tag: "Interrupted"; readonly cause: string }
    | { readonly _tag: "Failure"; readonly cause: string };
}

// ---------------------------------------------------------------------------
// Converters
// ---------------------------------------------------------------------------

function formatTraceExit(
  exit: Exit.Exit<unknown, unknown>
): EffectTraceRecord["exit"] {
  if (Exit.isSuccess(exit)) return { _tag: "Success" };
  if (Cause.hasInterruptsOnly(exit.cause)) {
    return { _tag: "Interrupted", cause: Cause.pretty(exit.cause) };
  }
  return { _tag: "Failure", cause: Cause.pretty(exit.cause) };
}

/** Minimal subset of `Tracer.Span` that we need for serialization. */
export interface SerializableSpan {
  readonly name: string;
  readonly traceId: string;
  readonly spanId: string;
  readonly parent: Option.Option<Tracer.AnySpan>;
  readonly status: Tracer.SpanStatus;
  readonly sampled: boolean;
  readonly kind: Tracer.SpanKind;
  readonly attributes: ReadonlyMap<string, unknown>;
  readonly links: ReadonlyArray<Tracer.SpanLink>;
  readonly events: ReadonlyArray<
    readonly [
      name: string,
      startTime: bigint,
      attributes: Record<string, unknown>,
    ]
  >;
}

/** Convert a completed Effect span into a JSON-serializable trace record. */
export function spanToTraceRecord(span: SerializableSpan): EffectTraceRecord {
  const status = span.status as Extract<Tracer.SpanStatus, { _tag: "Ended" }>;
  const parentSpanId = Option.getOrUndefined(span.parent)?.spanId;

  return {
    type: "effect-span",
    name: span.name,
    traceId: span.traceId,
    spanId: span.spanId,
    ...(parentSpanId ? { parentSpanId } : {}),
    sampled: span.sampled,
    kind: span.kind,
    startTimeUnixNano: String(status.startTime),
    endTimeUnixNano: String(status.endTime),
    durationMs: Number(status.endTime - status.startTime) / 1_000_000,
    attributes: compactTraceAttributes(Object.fromEntries(span.attributes)),
    events: span.events.map(([name, startTime, attributes]) => ({
      name,
      timeUnixNano: String(startTime),
      attributes: compactTraceAttributes(attributes),
    })),
    links: span.links.map((link) => ({
      traceId: link.span.traceId,
      spanId: link.span.spanId,
      attributes: compactTraceAttributes(link.attributes),
    })),
    exit: formatTraceExit(status.exit),
  };
}
