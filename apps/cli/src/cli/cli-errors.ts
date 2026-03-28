/**
 * Typed CLI errors.
 *
 * All CLI errors use `Schema.TaggedErrorClass` so they flow through Effect's
 * typed error channels.
 */
import * as Schema from "effect/Schema";

// ---------------------------------------------------------------------------
// Exit codes
// ---------------------------------------------------------------------------

export const ExitCode = {
  AuthFailure: 5,
  ResourceNotFound: 3,
  RuntimeFailure: 1,
  StateUnavailable: 4,
  Success: 0,
  UsageError: 2,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

// ---------------------------------------------------------------------------
// Core CLI error
// ---------------------------------------------------------------------------

/**
 * Carries an exit code and optional operator-facing details so callers can
 * present a short message without losing the underlying reason.
 */
export class CliFailure extends Schema.TaggedErrorClass<CliFailure>()(
  "CliFailure",
  {
    details: Schema.String.pipe(Schema.optionalKey),
    exitCode: Schema.Number,
    message: Schema.String,
  }
) {}

// ---------------------------------------------------------------------------
// Server transport errors
// ---------------------------------------------------------------------------

export class ServerConnectionError extends Schema.TaggedErrorClass<ServerConnectionError>()(
  "ServerConnectionError",
  {
    reason: Schema.String,
    url: Schema.String,
  }
) {
  get message() {
    return `Cannot reach the Ringi server at ${this.url}. Is 'ringi serve' running?\n  → ${this.reason}`;
  }
}

export class ServerResponseError extends Schema.TaggedErrorClass<ServerResponseError>()(
  "ServerResponseError",
  {
    body: Schema.String,
    status: Schema.Number,
    statusText: Schema.String,
  }
) {
  get message() {
    return `Server returned ${this.status} ${this.statusText}: ${this.body}`;
  }
}

// ---------------------------------------------------------------------------
// CLI domain errors
// ---------------------------------------------------------------------------

export class ResourceNotFoundError extends Schema.TaggedErrorClass<ResourceNotFoundError>()(
  "ResourceNotFoundError",
  {
    message: Schema.String,
    resource: Schema.String,
  }
) {}

export class ServerRequiredError extends Schema.TaggedErrorClass<ServerRequiredError>()(
  "ServerRequiredError",
  {
    message: Schema.String,
  }
) {}
