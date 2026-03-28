/**
 * CLI runtime utilities.
 *
 * Provides repository resolution and config construction that are
 * testable outside the Effect CLI framework.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { CliFailure, ExitCode } from "@/cli/cli-errors";
import type { CliConfigShape } from "@/cli/config";

export const resolveRepositoryRoot = (
  repoOverride?: string
): CliFailure | string => {
  const cwd = repoOverride ? resolve(repoOverride) : process.cwd();

  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
    }).trim();
  } catch {
    return new CliFailure({
      exitCode: ExitCode.StateUnavailable,
      message: repoOverride
        ? `Path ${cwd} is not a Git repository. Use --repo <path> with a valid repository root.`
        : `Could not resolve a Git repository from ${cwd}. Use --repo <path> with a valid repository root.`,
    });
  }
};

const resolveDbPath = (repoRoot: string, dbPathOverride?: string): string =>
  dbPathOverride
    ? resolve(dbPathOverride)
    : resolve(repoRoot, ".ringi/reviews.db");

export const resolveCliConfig = (args: {
  color: boolean;
  dbPath?: string;
  quiet: boolean;
  repo?: string;
  verbose: boolean;
}): CliConfigShape | CliFailure => {
  const repoRootResult = resolveRepositoryRoot(args.repo);
  if (repoRootResult instanceof CliFailure) {
    return repoRootResult;
  }

  return {
    color: args.color,
    cwd: process.cwd(),
    dbPath: resolveDbPath(repoRootResult, args.dbPath),
    outputMode: "human",
    quiet: args.quiet,
    repoRoot: repoRootResult,
    verbose: args.verbose,
  };
};

export const ensureLocalStateAvailable = (
  config: CliConfigShape
): CliFailure | undefined => {
  if (!existsSync(config.dbPath)) {
    return new CliFailure({
      exitCode: ExitCode.StateUnavailable,
      message: `Local state is missing at ${config.dbPath}. Run 'ringi data migrate' or start 'ringi serve' once to initialize local state.`,
    });
  }
  return undefined;
};
