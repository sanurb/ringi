/**
 * Observability configuration — reads RINGI_* env vars with sensible defaults.
 *
 * The config is consumed by ObservabilityLive to wire loggers, tracers,
 * and optional OTLP exporters.
 */

import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import type * as LogLevel from "effect/LogLevel";
import * as Option from "effect/Option";

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export interface ObservabilityConfig {
  // Local trace file
  readonly traceFilePath: string;
  readonly traceMaxBytes: number;
  readonly traceMaxFiles: number;
  readonly traceBatchWindowMs: number;
  readonly traceMinLevel: LogLevel.LogLevel;

  // OTLP (all optional)
  readonly otlpTracesUrl: string | undefined;
  readonly otlpMetricsUrl: string | undefined;
  readonly otlpServiceName: string;
  readonly otlpExportIntervalMs: number;
}

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------

/**
 * Read observability config from environment.
 *
 * @param defaultTracePath — surface-specific default (e.g. ".ringi/traces/server.trace.ndjson")
 * @param defaultServiceName — surface-specific default (e.g. "ringi-server")
 */
export const readObservabilityConfig = (
  defaultTracePath: string,
  defaultServiceName: string
): Effect.Effect<ObservabilityConfig, Config.ConfigError> =>
  Effect.gen(function* () {
    const traceFilePath = yield* Config.string("RINGI_TRACE_FILE").pipe(
      Config.withDefault(defaultTracePath)
    );
    const traceMaxBytes = yield* Config.int("RINGI_TRACE_MAX_BYTES").pipe(
      Config.withDefault(10_485_760)
    );
    const traceMaxFiles = yield* Config.int("RINGI_TRACE_MAX_FILES").pipe(
      Config.withDefault(5)
    );
    const traceBatchWindowMs = yield* Config.int(
      "RINGI_TRACE_BATCH_WINDOW_MS"
    ).pipe(Config.withDefault(200));
    const traceMinLevel = yield* Config.logLevel("RINGI_TRACE_MIN_LEVEL").pipe(
      Config.withDefault<LogLevel.LogLevel>("Info")
    );

    const otlpTracesUrl = yield* Config.option(
      Config.string("RINGI_OTLP_TRACES_URL")
    );
    const otlpMetricsUrl = yield* Config.option(
      Config.string("RINGI_OTLP_METRICS_URL")
    );
    const otlpServiceName = yield* Config.string(
      "RINGI_OTLP_SERVICE_NAME"
    ).pipe(Config.withDefault(defaultServiceName));
    const otlpExportIntervalMs = yield* Config.int(
      "RINGI_OTLP_EXPORT_INTERVAL_MS"
    ).pipe(Config.withDefault(10_000));

    return {
      otlpExportIntervalMs,
      otlpMetricsUrl: Option.getOrUndefined(otlpMetricsUrl),
      otlpServiceName,
      otlpTracesUrl: Option.getOrUndefined(otlpTracesUrl),
      traceBatchWindowMs,
      traceFilePath,
      traceMaxBytes,
      traceMaxFiles,
      traceMinLevel,
    } satisfies ObservabilityConfig;
  });
