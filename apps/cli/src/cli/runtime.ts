import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { CoreLive } from "@ringi/core/runtime";
import { GitService } from "@ringi/core/services/git.service";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";

import { CliConfigLive } from "@/cli/config";
import type { CliConfigShape } from "@/cli/config";
import { CliFailure, ExitCode } from "@/cli/contracts";
import type { ParsedCommand } from "@/cli/contracts";

/**
 * Bundles the resolved config with the matching runtime so the CLI can share
 * one setup and disposal path.
 */
export interface CliRuntimeResources {
  readonly config: CliConfigShape;
  readonly runtime: ManagedRuntime.ManagedRuntime<any, any>;
}

const resolveRepositoryRoot = (repoOverride?: string): CliFailure | string => {
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

const commandNeedsRepository = (command: ParsedCommand): boolean =>
  command.kind !== "help" &&
  command.kind !== "version" &&
  command.kind !== "mcp" &&
  command.kind !== "serve";

/**
 * Commands that need the database to already exist. `review-pr` is NOT here
 * because it auto-initializes `.ringi/` (like `serve` does).
 */
export const commandNeedsDatabase = (command: ParsedCommand): boolean =>
  command.kind === "review-list" ||
  command.kind === "review-show" ||
  command.kind === "review-export" ||
  command.kind === "review-status" ||
  command.kind === "todo-list" ||
  command.kind === "doctor";

export const commandUsesCoreRuntime = (command: ParsedCommand): boolean =>
  command.kind === "review-list" ||
  command.kind === "review-show" ||
  command.kind === "review-export" ||
  command.kind === "review-pr" ||
  command.kind === "review-status" ||
  command.kind === "todo-list" ||
  command.kind === "review-create" ||
  command.kind === "todo-add" ||
  command.kind === "doctor";

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

const makeConfigLayer = (config: CliConfigShape) =>
  ConfigProvider.layer(
    ConfigProvider.fromUnknown({
      DB_PATH: config.dbPath,
      REPOSITORY_PATH: config.repoRoot,
    })
  );

export const createCoreCliRuntime = (config: CliConfigShape) =>
  ManagedRuntime.make(
    Layer.mergeAll(CoreLive, CliConfigLive(config)).pipe(
      Layer.provideMerge(makeConfigLayer(config))
    )
  );

export const createGitCliRuntime = (config: CliConfigShape) =>
  ManagedRuntime.make(
    Layer.mergeAll(GitService.Default, CliConfigLive(config)).pipe(
      Layer.provideMerge(makeConfigLayer(config))
    )
  );

export const createCliRuntimeResources = (
  command: ParsedCommand,
  args: {
    color: boolean;
    dbPath?: string;
    quiet: boolean;
    repo?: string;
    verbose: boolean;
  }
): CliFailure | CliRuntimeResources | null => {
  if (!commandNeedsRepository(command)) {
    return null;
  }

  const configResult = resolveCliConfig(args);
  if (configResult instanceof CliFailure) {
    return configResult;
  }

  if (commandNeedsDatabase(command)) {
    const stateError = ensureLocalStateAvailable(configResult);
    if (stateError) {
      return stateError;
    }
  }

  return {
    config: configResult,
    runtime: commandUsesCoreRuntime(command)
      ? createCoreCliRuntime(configResult)
      : createGitCliRuntime(configResult),
  };
};
