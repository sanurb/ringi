/**
 * ObservabilityLive — the assembled observability layer.
 *
 * Provides:
 * - consolePretty logger  → stdout for humans
 * - tracerLogger          → converts logs inside spans to span events
 * - LocalFileTracer       → persists completed spans as NDJSON
 * - Trace level references
 *
 * OTLP export (OtlpTracer, OtlpMetrics) can be added later via separate
 * layers when the RINGI_OTLP_* env vars are set. For now, the base layer
 * keeps the dependency footprint minimal — zero infrastructure required.
 */

import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Tracer from "effect/Tracer";

import { makeLocalFileTracer } from "./local-file-tracer";
import { readObservabilityConfig } from "./observability-config";
import { makeTraceSink } from "./trace-sink";

// ---------------------------------------------------------------------------
// Surface-specific defaults
// ---------------------------------------------------------------------------

const SURFACE_DEFAULTS: Record<
  string,
  { tracePath: string; serviceName: string }
> = {
  cli: {
    tracePath: ".ringi/traces/cli.trace.ndjson",
    serviceName: "ringi-cli",
  },
  server: {
    tracePath: ".ringi/traces/server.trace.ndjson",
    serviceName: "ringi-server",
  },
};

// ---------------------------------------------------------------------------
// Layer factory
// ---------------------------------------------------------------------------

/**
 * Build the observability layer for a given surface.
 *
 * @param surface — "server" or "cli"
 */
export const ObservabilityLive = (
  surface: "server" | "cli" = "server"
): Layer.Layer<never, Config.ConfigError> => {
  const defaults = SURFACE_DEFAULTS[surface];

  return Layer.unwrap(
    Effect.gen(function* () {
      const config = yield* readObservabilityConfig(
        defaults.tracePath,
        defaults.serviceName
      );

      // ── Trace level refs ────────────────────────────────────────
      const traceRefsLayer = Layer.succeed(
        Tracer.MinimumTraceLevel,
        config.traceMinLevel
      );

      // ── Logger layer ────────────────────────────────────────────
      const loggerLayer = Logger.layer(
        [Logger.consolePretty(), Logger.tracerLogger],
        { mergeWithExisting: false }
      );

      // ── Tracer layer ────────────────────────────────────────────
      const tracerLayer = Layer.unwrap(
        Effect.gen(function* () {
          const sink = yield* makeTraceSink({
            filePath: config.traceFilePath,
            maxBytes: config.traceMaxBytes,
            maxFiles: config.traceMaxFiles,
            batchWindowMs: config.traceBatchWindowMs,
          });

          const tracer = yield* makeLocalFileTracer({
            filePath: config.traceFilePath,
            maxBytes: config.traceMaxBytes,
            maxFiles: config.traceMaxFiles,
            batchWindowMs: config.traceBatchWindowMs,
            sink,
          });

          return Layer.succeed(Tracer.Tracer, tracer);
        })
      );

      return Layer.mergeAll(loggerLayer, traceRefsLayer, tracerLayer);
    })
  );
};
