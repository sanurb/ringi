/**
 * CLI output formatting.
 *
 * Provides the RFC 9457-inspired JSON envelope for `--json` mode and
 * plain human-readable output for interactive use.
 */

// ---------------------------------------------------------------------------
// Types (kept from the old contracts.ts for external compatibility)
// ---------------------------------------------------------------------------

/** Error family for agent routing logic — branch on category, not message text. */
export type ErrorCategory =
  | "auth"
  | "config"
  | "conflict"
  | "connection"
  | "not_found"
  | "server"
  | "validation";

/** Machine-readable param descriptor for a HATEOAS next-action template. */
export interface NextActionParam {
  readonly default?: number | string;
  readonly description?: string;
  readonly enum?: readonly string[];
  readonly required?: boolean;
  readonly value?: number | string;
}

export interface NextAction {
  readonly command: string;
  readonly description: string;
  readonly params?: Readonly<Record<string, NextActionParam>>;
}

export interface CliErrorDetail {
  readonly category: ErrorCategory;
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly retry_after?: number;
  readonly type?: string;
}

interface CliSuccessEnvelope<T> {
  readonly command: string;
  readonly next_actions: readonly NextAction[];
  readonly ok: true;
  readonly result: T;
}

export interface CliErrorEnvelope {
  readonly command: string;
  readonly error: CliErrorDetail;
  readonly fix: string;
  readonly next_actions: readonly NextAction[];
  readonly ok: false;
}

export interface CommandOutput<T> {
  readonly data: T;
  readonly human?: string;
  readonly nextActions?: readonly NextAction[];
}

// ---------------------------------------------------------------------------
// Envelope constructors
// ---------------------------------------------------------------------------

export const successEnvelope = <T>(
  command: string,
  result: T,
  nextActions: readonly NextAction[] = []
): CliSuccessEnvelope<T> => ({
  command,
  next_actions: nextActions,
  ok: true,
  result,
});

export const failureEnvelope = (
  command: string,
  error: CliErrorDetail,
  fix: string,
  nextActions: readonly NextAction[] = []
): CliErrorEnvelope => ({
  command,
  error,
  fix,
  next_actions: nextActions,
  ok: false,
});

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------

export const writeJson = (payload: unknown): void => {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
};

export const writeHuman = (text: string | undefined): void => {
  if (text && text.length > 0) {
    process.stdout.write(`${text}\n`);
  }
};
