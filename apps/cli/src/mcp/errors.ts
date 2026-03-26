/**
 * MCP execution domain errors.
 *
 * All errors that can occur during sandbox execution are modeled as typed,
 * tagged errors for exhaustive handling via catchTag/catchTags.
 */

import * as Schema from "effect/Schema";

/** Code validation failed (empty, too long, non-string). */
export class InvalidCodeError extends Schema.TaggedError<InvalidCodeError>()(
  "InvalidCodeError",
  { message: Schema.String }
) {}

/** Timeout parameter is invalid (non-finite, zero, negative). */
export class InvalidTimeoutError extends Schema.TaggedError<InvalidTimeoutError>()(
  "InvalidTimeoutError",
  { message: Schema.String, received: Schema.Unknown }
) {}

/** Schema-based input decoding failed. */
export class InputDecodeError extends Schema.TaggedError<InputDecodeError>()(
  "InputDecodeError",
  { message: Schema.String, operation: Schema.String }
) {}

/** Write operation rejected in readonly mode. */
export class ReadonlyViolationError extends Schema.TaggedError<ReadonlyViolationError>()(
  "ReadonlyViolationError",
  { message: Schema.String }
) {}

/** Sandbox execution timed out. */
export class ExecutionTimeoutError extends Schema.TaggedError<ExecutionTimeoutError>()(
  "ExecutionTimeoutError",
  { message: Schema.String, timeoutMs: Schema.Number }
) {}

/** Sandbox execution failed with an unrecoverable error. */
export class SandboxExecutionError extends Schema.TaggedError<SandboxExecutionError>()(
  "SandboxExecutionError",
  { error: Schema.Defect, message: Schema.String }
) {}
