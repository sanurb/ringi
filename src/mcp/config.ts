import { execFileSync } from "node:child_process";

import * as Context from "effect/Context";
import * as Layer from "effect/Layer";

const DEFAULT_DB_PATH = ".ringi/reviews.db";
const DEFAULT_MAX_OUTPUT_BYTES = 100 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;

export interface McpConfigShape {
  readonly cwd: string;
  readonly dbPath: string;
  readonly defaultTimeoutMs: number;
  readonly maxOutputBytes: number;
  readonly maxTimeoutMs: number;
  readonly readonly: boolean;
  readonly repoRoot: string;
}

export class McpConfig extends Context.Tag("McpConfig")<
  McpConfig,
  McpConfigShape
>() {}

export const McpConfigLive = (config: McpConfigShape) =>
  Layer.succeed(McpConfig, config);

const resolveRepositoryRoot = (repoOverride?: string): string => {
  const cwd = repoOverride ?? process.cwd();

  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
  }).trim();
};

const resolveDbPath = (repoRoot: string, dbPathOverride?: string): string =>
  dbPathOverride ?? `${repoRoot}/${DEFAULT_DB_PATH}`;

const parseNumberFlag = (
  flagValue: string | undefined,
  fallback: number,
  name: string
): number => {
  if (flagValue === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(flagValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid ${name}: expected a positive integer, received ${flagValue}`
    );
  }

  return parsed;
};

export const resolveMcpConfig = (argv: readonly string[]): McpConfigShape => {
  const args = [...argv];
  const readonly = args.includes("--readonly");
  const dbIndex = args.indexOf("--db-path");
  const repoIndex = args.indexOf("--repo");
  const timeoutIndex = args.indexOf("--timeout-ms");
  const maxOutputIndex = args.indexOf("--max-output-bytes");

  const repoRoot = resolveRepositoryRoot(
    repoIndex === -1 ? undefined : args[repoIndex + 1]
  );

  return {
    cwd: process.cwd(),
    dbPath: resolveDbPath(
      repoRoot,
      dbIndex === -1 ? undefined : args[dbIndex + 1]
    ),
    defaultTimeoutMs: parseNumberFlag(
      timeoutIndex === -1 ? undefined : args[timeoutIndex + 1],
      DEFAULT_TIMEOUT_MS,
      "timeout"
    ),
    maxOutputBytes: parseNumberFlag(
      maxOutputIndex === -1 ? undefined : args[maxOutputIndex + 1],
      DEFAULT_MAX_OUTPUT_BYTES,
      "max output bytes"
    ),
    maxTimeoutMs: MAX_TIMEOUT_MS,
    readonly,
    repoRoot,
  };
};
