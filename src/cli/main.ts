#!/usr/bin/env -S npx tsx

import * as Either from "effect/Either";

import { ReviewNotFound } from "@/api/schemas/review";
import { TodoNotFound } from "@/api/schemas/todo";
import { runCommand } from "@/cli/commands";
import { CliFailure, ExitCode } from "@/cli/contracts";
import type {
  ExitCode as ExitCodeType,
  JsonEnvelope,
  ParsedCommand,
} from "@/cli/contracts";
import { parseCliArgs } from "@/cli/parser";
import { createCliRuntimeResources } from "@/cli/runtime";

const CLI_VERSION = "0.0.0-dev";

// ---------------------------------------------------------------------------
// Help text (lookup-table, not switch)
// ---------------------------------------------------------------------------

const ROOT_HELP = `ringi — local-first review CLI

Usage:
  ringi [global options] <command>

Global options:
  --json            Emit { ok, data, error? } JSON to stdout
  --repo <path>     Use a specific Git repository root
  --db-path <path>  Override the SQLite database path
  --quiet           Suppress human-readable success output
  --verbose         Include stack traces on failures
  --no-color        Disable ANSI color output
  --help            Show help
  --version         Show version

Commands:
  review list [--status <status>] [--source <type>] [--limit <n>] [--page <n>]
  review show <id|last> [--comments] [--todos]
  review create [--source <staged|branch|commits>] [--branch <name>] [--commits <range>]
  review export <id|last> [--output <path>] [--stdout]
  source list
  source diff <staged|branch|commits> [--branch <name>] [--commits <range>] [--stat]
  todo list [--review <id>] [--status <pending|done|all>] [--limit <n>] [--offset <n>]
  todo add --text <text> [--review <id>]
  export <id|last> [--output <path>] [--stdout]
`;

const HELP_TOPICS: Readonly<Record<string, string>> = {
  review: `ringi review

Usage:
  ringi review list [--status <status>] [--source <type>] [--limit <n>] [--page <n>]
  ringi review show <id|last> [--comments] [--todos]
  ringi review create [--source <staged|branch|commits>] [--branch <name>] [--commits <range>]
  ringi review export <id|last> [--output <path>] [--stdout]
`,
  source: `ringi source

Usage:
  ringi source list
  ringi source diff <staged|branch|commits> [--branch <name>] [--commits <range>] [--stat]
`,
  todo: `ringi todo

Usage:
  ringi todo list [--review <id>] [--status <pending|done|all>] [--limit <n>] [--offset <n>]
  ringi todo add --text <text> [--review <id>] [--position <n>]
`,
};

const renderHelp = (command: ParsedCommand): string => {
  if (command.kind !== "help") {
    return ROOT_HELP;
  }
  const [topic] = command.topic;
  return (topic && HELP_TOPICS[topic]) ?? ROOT_HELP;
};

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

const writeJson = <T>(payload: JsonEnvelope<T>): void => {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
};

const writeHuman = (text: string | undefined): void => {
  if (text && text.length > 0) {
    process.stdout.write(`${text}\n`);
  }
};

// ---------------------------------------------------------------------------
// Error normalization
// ---------------------------------------------------------------------------

interface NormalizedFailure {
  readonly exitCode: ExitCodeType;
  readonly message: string;
  readonly verbose?: string;
}

const mapFailure = (error: unknown): NormalizedFailure => {
  if (error instanceof CliFailure) {
    return {
      exitCode: error.exitCode as ExitCodeType,
      message: error.message,
      verbose: error.details,
    };
  }

  if (error instanceof ReviewNotFound || error instanceof TodoNotFound) {
    return {
      exitCode: ExitCode.ResourceNotFound,
      message: error.message,
      verbose: error.stack,
    };
  }

  if (error instanceof Error) {
    return {
      exitCode: ExitCode.RuntimeFailure,
      message: error.message,
      verbose: error.stack,
    };
  }

  return {
    exitCode: ExitCode.RuntimeFailure,
    message: "Unknown CLI failure.",
  };
};

// ---------------------------------------------------------------------------
// Signal handling
// ---------------------------------------------------------------------------

const installSignalHandlers = (dispose: () => Promise<void>): (() => void) => {
  const shutdown = async () => {
    await dispose();
    process.exit(ExitCode.RuntimeFailure);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  return () => {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
  };
};

// ---------------------------------------------------------------------------
// Main program
// ---------------------------------------------------------------------------

const main = async (): Promise<void> => {
  const parseResult = parseCliArgs(process.argv.slice(2));

  if (Either.isLeft(parseResult)) {
    const failure = mapFailure(parseResult.left);
    process.stderr.write(`${failure.message}\n`);
    process.exit(failure.exitCode);
  }

  const { command, options } = parseResult.right;

  if (command.kind === "help") {
    writeHuman(renderHelp(command));
    process.exit(ExitCode.Success);
  }

  if (command.kind === "version") {
    writeHuman(CLI_VERSION);
    process.exit(ExitCode.Success);
  }

  const runtimeResources = createCliRuntimeResources(command, {
    color: options.color,
    dbPath: options.dbPath,
    quiet: options.quiet,
    repo: options.repo,
    verbose: options.verbose,
  });

  if (runtimeResources === null) {
    process.exit(ExitCode.Success);
  }

  if (runtimeResources instanceof CliFailure) {
    const failure = mapFailure(runtimeResources);
    if (options.json) {
      writeJson({ data: null, error: failure.message, ok: false });
    }
    process.stderr.write(`${failure.message}\n`);
    process.exit(failure.exitCode);
  }

  const removeSignalHandlers = installSignalHandlers(() =>
    runtimeResources.runtime.dispose()
  );

  try {
    const output = (await runtimeResources.runtime.runPromise(
      runCommand(command) as never
    )) as { data: unknown; human?: string };

    if (options.json) {
      writeJson({ data: output.data, ok: true });
    } else if (!options.quiet) {
      writeHuman(output.human);
    }

    await runtimeResources.runtime.dispose();
    removeSignalHandlers();
    process.exit(ExitCode.Success);
  } catch (error) {
    const failure = mapFailure(error);

    if (options.json) {
      writeJson({ data: null, error: failure.message, ok: false });
    }

    process.stderr.write(`${failure.message}\n`);
    if (options.verbose && failure.verbose) {
      process.stderr.write(`${failure.verbose}\n`);
    }

    await runtimeResources.runtime.dispose();
    removeSignalHandlers();
    process.exit(failure.exitCode);
  }
};

try {
  await main();
} catch (error) {
  const failure = mapFailure(error);
  const wantsJson = process.argv.slice(2).includes("--json");

  if (wantsJson) {
    writeJson({ data: null, error: failure.message, ok: false });
  }

  process.stderr.write(`${failure.message}\n`);
  process.exit(failure.exitCode);
}
