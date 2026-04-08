/**
 * TraceSink — buffered NDJSON writer with synchronous rotating file I/O.
 *
 * Spans are pushed into an in-memory buffer. A background fiber flushes the
 * buffer to disk every `batchWindowMs` milliseconds. An immediate flush also
 * triggers when the buffer exceeds `FLUSH_BUFFER_THRESHOLD` records.
 *
 * File rotation happens when the current file exceeds `maxBytes`. Old files
 * are renamed with `.1`, `.2`, etc. suffixes up to `maxFiles`.
 */

import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import { dirname } from "node:path";

import * as Effect from "effect/Effect";

import type { EffectTraceRecord } from "./trace-record";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const FLUSH_BUFFER_THRESHOLD = 32;

export interface TraceSinkOptions {
  readonly filePath: string;
  readonly maxBytes: number;
  readonly maxFiles: number;
  readonly batchWindowMs: number;
}

// ---------------------------------------------------------------------------
// Rotating file writer
// ---------------------------------------------------------------------------

class RotatingFileWriter {
  private readonly filePath: string;
  private readonly maxBytes: number;
  private readonly maxFiles: number;

  constructor(options: {
    filePath: string;
    maxBytes: number;
    maxFiles: number;
  }) {
    this.filePath = options.filePath;
    this.maxBytes = options.maxBytes;
    this.maxFiles = options.maxFiles;
    mkdirSync(dirname(this.filePath), { recursive: true });
  }

  write(chunk: string): void {
    this.rotateIfNeeded();
    appendFileSync(this.filePath, chunk, "utf8");
  }

  private rotateIfNeeded(): void {
    let size: number;
    try {
      size = statSync(this.filePath).size;
    } catch {
      return; // file doesn't exist yet
    }

    if (size < this.maxBytes) return;

    // Shift existing rotated files: .4 → .5, .3 → .4, ...
    for (let i = this.maxFiles - 1; i >= 1; i--) {
      try {
        renameSync(`${this.filePath}.${i}`, `${this.filePath}.${i + 1}`);
      } catch {
        // target doesn't exist — fine
      }
    }

    // Current → .1
    try {
      renameSync(this.filePath, `${this.filePath}.1`);
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// TraceSink
// ---------------------------------------------------------------------------

export interface TraceSink {
  readonly filePath: string;
  push(record: EffectTraceRecord): void;
  flush: Effect.Effect<void>;
  close: () => Effect.Effect<void>;
}

export const makeTraceSink = Effect.fn("makeTraceSink")(function* (
  options: TraceSinkOptions
) {
  const writer = new RotatingFileWriter({
    filePath: options.filePath,
    maxBytes: options.maxBytes,
    maxFiles: options.maxFiles,
  });

  let buffer: Array<string> = [];

  const flushUnsafe = () => {
    if (buffer.length === 0) return;

    const chunk = buffer.join("");
    buffer = [];

    try {
      writer.write(chunk);
    } catch {
      // If write fails, put it back for next attempt
      buffer.unshift(chunk);
    }
  };

  const flush = Effect.sync(flushUnsafe).pipe(Effect.withTracerEnabled(false));

  // Flush on scope finalization
  yield* Effect.addFinalizer(() => flush.pipe(Effect.ignore));

  // Periodic background flush
  yield* Effect.forkScoped(
    Effect.sleep(`${options.batchWindowMs} millis`).pipe(
      Effect.andThen(flush),
      Effect.forever
    )
  );

  return {
    filePath: options.filePath,
    push(record) {
      try {
        buffer.push(`${JSON.stringify(record)}\n`);
        if (buffer.length >= FLUSH_BUFFER_THRESHOLD) {
          flushUnsafe();
        }
      } catch {
        // Serialization failure — drop the record rather than crash
      }
    },
    flush,
    close: () => flush,
  } satisfies TraceSink;
});
