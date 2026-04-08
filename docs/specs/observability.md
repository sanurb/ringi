# Observability Design — Local-First Traces, Human Logs, Optional OTLP

Status: Proposed | Author: agent | Date: 2026-04-07

---

## 1. Executive Recommendation

Add a single observability layer to `packages/core` that:

- Sends **pretty logs to stdout** for humans (already partially done via `Logger.consolePretty()`)
- Persists **completed spans as NDJSON** to a local trace file — the primary debugging artifact
- Optionally exports **traces and metrics over OTLP** to a local Grafana LGTM stack
- Installs `Logger.tracerLogger` so logs inside spans become span events automatically
- Requires **zero infrastructure** for local development — the trace file is always on

This follows the same model as [pingdotgg/t3code](https://github.com/pingdotgg/t3code/blob/main/docs/observability.md), adapted to Ringi's architecture (pnpm monorepo, Effect v4 beta.41, `packages/core` + two apps, SQLite, no desktop surface).

---

## 2. Current-State Gaps

| Area             | Current state                                                                                                                                          | Gap                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Logging          | `Logger.consolePretty()` in `api-handler.ts` only. Scattered `console.log` in UI components. 3 uses of `Effect.logError`, 1 `Effect.logDebug` in core. | No structured logging layer. No `tracerLogger`. Logs vanish after stdout scroll.                                                             |
| Tracing          | ~30 spans via `Effect.fn("name")` and `Effect.withSpan` in core services (git, gh, pr-session).                                                        | Spans exist but are **not persisted anywhere**. No tracer is installed — Effect uses its default `NativeSpan` which does nothing on `end()`. |
| Metrics          | None.                                                                                                                                                  | No counters, no timers. Fine for now — add after traces are working.                                                                         |
| Correlation      | No trace/span IDs visible in logs or persisted artifacts.                                                                                              | Cannot follow a request through service calls.                                                                                               |
| Agent inspection | No local artifacts an agent can query.                                                                                                                 | Agents have no way to diagnose failures or latency.                                                                                          |
| OTLP             | Not configured.                                                                                                                                        | No path to Grafana/Tempo when deeper analysis is needed.                                                                                     |

---

## 3. Target Observability Model

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  stdout      │     │  Local NDJSON │     │  OTLP (optional) │
│  pretty logs │     │  trace file   │     │  Grafana LGTM    │
└──────┬───────┘     └──────┬───────┘     └──────┬───────────┘
       │                    │                    │
       │  consolePretty()   │  LocalFileTracer   │  OtlpTracer + OtlpMetrics
       │                    │                    │
       └────────────────────┴────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │  ObservabilityLive Layer   │
              │  (packages/core)           │
              │                           │
              │  • consolePretty logger   │
              │  • tracerLogger           │
              │  • LocalFileTracer        │
              │  • optional OtlpTracer    │
              │  • optional OtlpMetrics   │
              │  • trace level refs       │
              └───────────────────────────┘
```

**Where it lives:** `packages/core/src/observability/` — both apps consume it through the existing `CoreLive` layer.

---

## 4. Local Trace File Design

### File path

| Context          | Default path                                                      | Override                   |
| ---------------- | ----------------------------------------------------------------- | -------------------------- |
| Web server (dev) | `.ringi/traces/server.trace.ndjson` (relative to repo root)       | `RINGI_TRACE_FILE` env var |
| CLI              | `.ringi/traces/cli.trace.ndjson` (relative to resolved repo root) | `RINGI_TRACE_FILE` env var |

### Schema (one JSON object per line)

```typescript
interface TraceRecord {
  // Discriminator
  type: "effect-span";

  // Identity
  name: string; // span name ("GitService.getStagedDiff")
  traceId: string; // 32-hex trace correlation
  spanId: string; // 16-hex span ID
  parentSpanId?: string; // parent span ID if nested

  // Timing
  startTimeUnixNano: string; // bigint as string
  endTimeUnixNano: string;
  durationMs: number; // human-friendly milliseconds

  // Classification
  kind: "internal" | "server" | "client";
  sampled: boolean;

  // Structured context
  attributes: Record<string, unknown>; // span annotations

  // Embedded log events (from tracerLogger)
  events: Array<{
    name: string;
    timeUnixNano: string;
    attributes: Record<string, unknown>;
  }>;

  // Links to related spans
  links: Array<{
    traceId: string;
    spanId: string;
    attributes: Record<string, unknown>;
  }>;

  // Outcome
  exit:
    | { _tag: "Success" }
    | { _tag: "Failure"; cause: string }
    | { _tag: "Interrupted"; cause: string };
}
```

### Rotation

| Setting            | Default | Env var                       |
| ------------------ | ------- | ----------------------------- |
| Max file size      | 10 MB   | `RINGI_TRACE_MAX_BYTES`       |
| Max rotated files  | 5       | `RINGI_TRACE_MAX_FILES`       |
| Batch flush window | 200 ms  | `RINGI_TRACE_BATCH_WINDOW_MS` |

### Persistence mechanics

A `TraceSink` buffers serialized NDJSON strings in memory and flushes to disk periodically (every `batchWindowMs`) or when the buffer exceeds 32 records. A `RotatingFileSink` handles byte-limit rotation. The sink writes synchronously (`fs.appendFileSync`) to avoid async backpressure — trace writes must never slow down the main workload.

---

## 5. Logging vs Tracing Rules

| Signal                                    | Destination                                     | Persisted?                       | Purpose            |
| ----------------------------------------- | ----------------------------------------------- | -------------------------------- | ------------------ |
| `Effect.logInfo(...)`                     | stdout (pretty) + span event (if inside a span) | Only as span event in trace file | Human awareness    |
| `Effect.logDebug(...)`                    | stdout (pretty, if level allows) + span event   | Only as span event               | Developer detail   |
| `Effect.logError(...)`                    | stdout (pretty) + span event                    | Only as span event               | Error visibility   |
| `Effect.withSpan(...)` / `Effect.fn(...)` | Trace file as completed span                    | **Yes — NDJSON**                 | Machine analysis   |
| `Effect.annotateCurrentSpan(...)`         | Span attributes                                 | **Yes — in span record**         | Structured context |

**Key rule:** Logs outside spans are **not persisted**. If you want a log message to survive in the trace file, emit it inside an active span. `Logger.tracerLogger` automatically converts it to a span event.

---

## 6. OTLP / Local LGTM Integration Plan

### Env vars

| Variable                        | Purpose                | Default                       |
| ------------------------------- | ---------------------- | ----------------------------- |
| `RINGI_OTLP_TRACES_URL`         | OTLP trace endpoint    | unset (disabled)              |
| `RINGI_OTLP_METRICS_URL`        | OTLP metrics endpoint  | unset (disabled)              |
| `RINGI_OTLP_SERVICE_NAME`       | Service name in traces | `ringi-server` or `ringi-cli` |
| `RINGI_OTLP_EXPORT_INTERVAL_MS` | Export batch interval  | `10000`                       |

### Startup behavior

1. Local trace file is **always on** — no env vars needed.
2. If `RINGI_OTLP_TRACES_URL` is set, the `LocalFileTracer` delegates to an `OtlpTracer` which additionally exports spans to the OTLP endpoint.
3. If `RINGI_OTLP_METRICS_URL` is set, `OtlpMetrics.layer` is added.
4. If neither OTLP var is set, everything works locally with zero overhead.

### Running with local LGTM

```bash
# 1. Start Grafana LGTM
docker run --name lgtm -p 3000:3000 -p 4317:4317 -p 4318:4318 --rm -ti grafana/otel-lgtm

# 2. Export env vars
export RINGI_OTLP_TRACES_URL=http://localhost:4318/v1/traces
export RINGI_OTLP_METRICS_URL=http://localhost:4318/v1/metrics
export RINGI_OTLP_SERVICE_NAME=ringi-local

# 3. Run dev server
pnpm dev
```

---

## 7. Agent-Facing Observability Workflows

Agents inspect the local NDJSON trace file with standard Unix tools. No hosted backend needed.

### Find failed spans

```bash
jq -c 'select(.exit._tag != "Success") | {name, durationMs, exit, attributes}' \
  .ringi/traces/server.trace.ndjson
```

### Find slow spans (>500ms)

```bash
jq -c 'select(.durationMs > 500) | {name, durationMs, traceId, spanId}' \
  .ringi/traces/server.trace.ndjson
```

### Inspect log events inside spans

```bash
jq -c 'select(any(.events[]?; .attributes["effect.logLevel"] != null)) | {
  name, durationMs,
  events: [.events[] | select(.attributes["effect.logLevel"] != null) | {message: .name, level: .attributes["effect.logLevel"]}]
}' .ringi/traces/server.trace.ndjson
```

### Follow one trace through all spans

```bash
jq -r 'select(.traceId == "TRACE_ID") | [.name, .spanId, (.parentSpanId // "-"), .durationMs] | @tsv' \
  .ringi/traces/server.trace.ndjson
```

### Tail live

```bash
tail -f .ringi/traces/server.trace.ndjson | jq .
```

### Find git operations

```bash
jq -c 'select(.name | startswith("GitService")) | {name, durationMs, exit}' \
  .ringi/traces/server.trace.ndjson
```

### Find database-heavy requests

```bash
jq -c 'select(.name | startswith("SqliteService") or startswith("Repo.")) | {name, durationMs}' \
  .ringi/traces/server.trace.ndjson
```

---

## 8. Concrete Instrumentation Plan by Layer

### Already instrumented (keep as-is)

| Location                                     | Spans                                    |
| -------------------------------------------- | ---------------------------------------- |
| `packages/core/src/services/git.service.ts`  | ~15 spans via `Effect.fn` and `withSpan` |
| `packages/core/src/services/gh.service.ts`   | ~5 spans via `Effect.fn` and `withSpan`  |
| `packages/core/src/services/pr-session.ts`   | 2 spans via `Effect.fn`                  |
| `packages/core/src/services/pr-preflight.ts` | 1 span via `Effect.fn`                   |

### Needs instrumentation

| Location                                           | What to add                                                                                       | Priority |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------- |
| `packages/core/src/services/review.service.ts`     | `Effect.fn("ReviewService.create")`, `.list`, `.getById`, `.update`, `.remove` — wrap each method | **P1**   |
| `packages/core/src/services/comment.service.ts`    | `Effect.fn` on each method                                                                        | P1       |
| `packages/core/src/services/todo.service.ts`       | `Effect.fn` on each method                                                                        | P1       |
| `packages/core/src/services/export.service.ts`     | `Effect.fn` on export operation                                                                   | P1       |
| `packages/core/src/services/annotation.service.ts` | `Effect.fn` on each method                                                                        | P2       |
| `packages/core/src/services/coverage.service.ts`   | `Effect.fn` on each method                                                                        | P2       |
| `packages/core/src/repos/*.repo.ts`                | `Effect.withSpan("Repo.ReviewRepo.create")` on key repo methods                                   | P2       |
| `packages/core/src/db/database.ts`                 | Span on `withTransaction`                                                                         | P2       |
| `apps/web/src/routes/api/-lib/wiring/*.ts`         | Span on each API handler (Effect HttpApi spans may already exist)                                 | P3       |
| `apps/cli/src/cli/commands.ts`                     | Top-level `Effect.withSpan("cli.review.create")` per command handler                              | P2       |

### Instrumentation style guide

```typescript
// Preferred: Effect.fn creates a span automatically
export const createReview = Effect.fn("ReviewService.create")(function* (
  input: CreateReviewInput
) {
  yield* Effect.annotateCurrentSpan({
    "review.sourceType": input.sourceType,
    "review.sourceRef": input.sourceRef ?? "none",
  });
  // ... existing logic
});

// For methods on a ServiceMap.Service, wrap the implementation:
const create = (input: CreateReviewInput) =>
  Effect.gen(function* () {
    // ... existing logic
  }).pipe(
    Effect.withSpan("ReviewService.create"),
    Effect.tap(() =>
      Effect.annotateCurrentSpan({
        "review.sourceType": input.sourceType,
      })
    )
  );
```

### What NOT to instrument

- React components or client-side hooks
- Pure schema validation functions
- Trivial getters or formatters
- Anything that runs <1ms and is called thousands of times

---

## 9. Environment Variables (Complete Reference)

### Local trace file

| Variable                      | Default                                | Description                  |
| ----------------------------- | -------------------------------------- | ---------------------------- |
| `RINGI_TRACE_FILE`            | `.ringi/traces/{surface}.trace.ndjson` | Override trace file path     |
| `RINGI_TRACE_MAX_BYTES`       | `10485760` (10 MB)                     | Per-file rotation threshold  |
| `RINGI_TRACE_MAX_FILES`       | `5`                                    | Number of rotated files kept |
| `RINGI_TRACE_BATCH_WINDOW_MS` | `200`                                  | Flush interval               |
| `RINGI_TRACE_MIN_LEVEL`       | `Info`                                 | Minimum span trace level     |

### OTLP export (all optional)

| Variable                        | Default                      | Description                |
| ------------------------------- | ---------------------------- | -------------------------- |
| `RINGI_OTLP_TRACES_URL`         | unset                        | OTLP/HTTP trace endpoint   |
| `RINGI_OTLP_METRICS_URL`        | unset                        | OTLP/HTTP metrics endpoint |
| `RINGI_OTLP_SERVICE_NAME`       | `ringi-server` / `ringi-cli` | Service name               |
| `RINGI_OTLP_EXPORT_INTERVAL_MS` | `10000`                      | Export batch interval      |

---

## 10. File-by-File Implementation Plan

### New files

| File                                                      | Purpose                                                                                |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `packages/core/src/observability/trace-record.ts`         | `TraceRecord` type + `spanToTraceRecord()` converter                                   |
| `packages/core/src/observability/attributes.ts`           | `compactTraceAttributes()` — normalize attribute values for JSON                       |
| `packages/core/src/observability/trace-sink.ts`           | `TraceSink` — buffered NDJSON writer with rotating file sink                           |
| `packages/core/src/observability/local-file-tracer.ts`    | `LocalFileTracer` — custom `Tracer.Tracer` that records completed spans to `TraceSink` |
| `packages/core/src/observability/observability-layer.ts`  | `ObservabilityLive` — assembled Layer combining logger + tracer + optional OTLP        |
| `packages/core/src/observability/observability-config.ts` | Effect `Config` service reading all `RINGI_*` env vars                                 |
| `packages/core/src/observability/index.ts`                | Barrel export                                                                          |

### Modified files

| File                                            | Change                                                                              |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| `packages/core/src/runtime.ts`                  | Add `ObservabilityLive` to `CoreLive` layer composition                             |
| `apps/web/src/routes/api/-lib/api-handler.ts`   | Remove ad-hoc `Logger.layer([Logger.consolePretty()])` — now provided by `CoreLive` |
| `packages/core/src/services/review.service.ts`  | Wrap methods with `Effect.withSpan` + `annotateCurrentSpan`                         |
| `packages/core/src/services/comment.service.ts` | Same                                                                                |
| `packages/core/src/services/todo.service.ts`    | Same                                                                                |
| `packages/core/src/services/export.service.ts`  | Same                                                                                |

### .gitignore

Add: `.ringi/traces/`

---

## 11. Risks, Tradeoffs, and Non-Goals

### Risks

| Risk                                        | Mitigation                                                                         |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| Trace file grows unbounded                  | Rotating file sink with 10 MB × 5 = 50 MB max                                      |
| Sync file writes block event loop           | Batch buffer flushes every 200ms — individual span ends only push to memory buffer |
| `effect/unstable/observability` API changes | Pin to beta.41, adapt on upgrade                                                   |
| Span noise from high-frequency repo queries | Only instrument service-level boundaries, not individual SQL statements            |

### Tradeoffs

| Decision                    | Rationale                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------- |
| Traces in core, not per-app | Both apps share the same service layer — one tracer covers both                       |
| No metrics in v1            | Traces cover the immediate debugging need. Metrics add value later for trend analysis |
| No client-side tracing      | Ringi's complexity is server/CLI-side. Client tracing is low ROI now                  |
| Synchronous file writes     | Simpler than async, and the batch window amortizes the cost                           |

### Non-goals

- Enterprise APM integration
- Distributed tracing across multiple Ringi instances
- Client-side (browser) performance monitoring
- Log aggregation or full-text search over logs
- Alerts or dashboards (use Grafana if needed)
