#!/usr/bin/env node

import * as Either from "effect/Either";

import { ReviewNotFound } from "@/api/schemas/review";
import { TodoNotFound } from "@/api/schemas/todo";
import { commandLabel, runCommand } from "@/cli/commands";
import { CliFailure, ExitCode, failure, success } from "@/cli/contracts";
import type {
  CliErrorDetail,
  CliErrorEnvelope,
  ErrorCategory,
  ExitCode as ExitCodeType,
  NextAction,
  ParsedCommand,
} from "@/cli/contracts";
import { parseCliArgs } from "@/cli/parser";
import { createCliRuntimeResources } from "@/cli/runtime";

const CLI_VERSION =
  process.env.RINGI_VERSION ?? process.env.npm_package_version ?? "0.0.0-dev";

// ---------------------------------------------------------------------------
// Self-documenting command tree (returned for `ringi --json` with no command)
// ---------------------------------------------------------------------------

const COMMAND_TREE = {
  commands: [
    {
      description: "List review sessions",
      name: "review list",
      usage:
        "ringi review list [--status <status>] [--source <type>] [--limit <n>] [--page <n>]",
    },
    {
      description: "Show review details",
      name: "review show",
      usage: "ringi review show <id|last> [--comments] [--todos]",
    },
    {
      description: "Create a review session",
      name: "review create",
      usage:
        "ringi review create [--source <staged|branch|commits>] [--branch <name>] [--commits <range>]",
    },
    {
      description: "Export review as markdown",
      name: "review export",
      usage: "ringi review export <id|last> [--output <path>] [--stdout]",
    },
    {
      description: "Resolve a review session",
      name: "review resolve",
      usage: "ringi review resolve <id|last> [--all-comments] [--yes]",
    },
    {
      description: "Show repository and review status",
      name: "review status",
      usage: "ringi review status [--review <id|last>] [--source <type>]",
    },
    {
      description: "List repository sources",
      name: "source list",
      usage: "ringi source list",
    },
    {
      description: "Show diff for a source",
      name: "source diff",
      usage:
        "ringi source diff <staged|branch|commits> [--branch <name>] [--commits <range>] [--stat]",
    },
    {
      description: "List todo items",
      name: "todo list",
      usage:
        "ringi todo list [--review <id>] [--status <pending|done|all>] [--limit <n>] [--offset <n>]",
    },
    {
      description: "Add a todo item",
      name: "todo add",
      usage: "ringi todo add --text <text> [--review <id>] [--position <n>]",
    },
    {
      description: "Mark a todo as done",
      name: "todo done",
      usage: "ringi todo done <id>",
    },
    {
      description: "Reopen a completed todo",
      name: "todo undone",
      usage: "ringi todo undone <id>",
    },
    {
      description: "Move a todo to a position",
      name: "todo move",
      usage: "ringi todo move <id> --position <n>",
    },
    {
      description: "Remove a todo",
      name: "todo remove",
      usage: "ringi todo remove <id> [--yes]",
    },
    {
      description: "Clear completed todos",
      name: "todo clear",
      usage: "ringi todo clear [--review <id>] [--done-only] [--all] [--yes]",
    },
    {
      description: "Start the local Ringi server",
      name: "serve",
      usage:
        "ringi serve [--host <host>] [--port <port>] [--https] [--auth] [--no-open]",
    },
    {
      description: "Start the MCP stdio server",
      name: "mcp",
      usage: "ringi mcp [--readonly] [--log-level <level>]",
    },
    {
      description: "Run local diagnostics",
      name: "doctor",
      usage: "ringi doctor",
    },
    {
      description: "Tail server events",
      name: "events",
      usage: "ringi events [--type <reviews|comments|todos|files>]",
    },
    {
      description: "Run database migrations",
      name: "data migrate",
      usage: "ringi data migrate",
    },
    {
      description: "Reset local data",
      name: "data reset",
      usage: "ringi data reset [--yes] [--keep-exports]",
    },
  ],
  description: "ringi — local-first code review CLI",
  version: CLI_VERSION,
};

const ROOT_NEXT_ACTIONS: NextAction[] = [
  {
    command: "ringi review list [--status <status>] [--source <type>]",
    description: "List review sessions",
    params: {
      source: { enum: ["staged", "branch", "commits"] },
      status: { enum: ["in_progress", "approved", "changes_requested"] },
    },
  },
  {
    command: "ringi source list",
    description: "List repository sources",
  },
  {
    command: "ringi review create [--source <source>]",
    description: "Create a new review session",
    params: {
      source: { default: "staged", enum: ["staged", "branch", "commits"] },
    },
  },
  {
    command: "ringi todo list [--status <status>]",
    description: "List todos",
    params: {
      status: { default: "pending", enum: ["pending", "done", "all"] },
    },
  },
  {
    command: "ringi review status",
    description: "Show repository and review status",
  },
];

// ---------------------------------------------------------------------------
// Help text (lookup-table, not switch)
// ---------------------------------------------------------------------------

const ROOT_HELP = `ringi — local-first review CLI

Usage:
  ringi [global options] <command>

Global options:
  --json            Emit structured JSON envelope to stdout
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
  review resolve <id|last> [--all-comments] [--yes]
  review status [--review <id|last>] [--source <type>]
  source list
  source diff <staged|branch|commits> [--branch <name>] [--commits <range>] [--stat]
  todo list [--review <id>] [--status <pending|done|all>] [--limit <n>] [--offset <n>]
  todo add --text <text> [--review <id>]
  todo done <id>
  todo undone <id>
  todo move <id> --position <n>
  todo remove <id> [--yes]
  todo clear [--review <id>] [--done-only] [--all] [--yes]
  export <id|last> [--output <path>] [--stdout]
`;

const HELP_TOPICS: Readonly<Record<string, string>> = {
  data: `ringi data

Usage:
  ringi data migrate
  ringi data reset [--yes] [--keep-exports]
`,
  review: `ringi review

Usage:
  ringi review list [--status <status>] [--source <type>] [--limit <n>] [--page <n>]
  ringi review show <id|last> [--comments] [--todos]
  ringi review create [--source <staged|branch|commits>] [--branch <name>] [--commits <range>]
  ringi review export <id|last> [--output <path>] [--stdout]
  ringi review resolve <id|last> [--all-comments] [--yes]
  ringi review status [--review <id|last>] [--source <type>]
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
  ringi todo done <id>
  ringi todo undone <id>
  ringi todo move <id> --position <n>
  ringi todo remove <id> [--yes]
  ringi todo clear [--review <id>] [--done-only] [--all] [--yes]
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

const writeJson = (payload: unknown): void => {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
};

const writeHuman = (text: string | undefined): void => {
  if (text && text.length > 0) {
    process.stdout.write(`${text}\n`);
  }
};

// ---------------------------------------------------------------------------
// Error normalization (RFC 9457-inspired)
// ---------------------------------------------------------------------------

interface NormalizedFailure {
  readonly category: ErrorCategory;
  readonly code: string;
  readonly exitCode: ExitCodeType;
  readonly message: string;
  readonly retryable: boolean;
  readonly verbose?: string;
}

/** Maps exit codes to error categories and retryable status. */
const EXIT_CODE_META: Readonly<
  Record<number, { category: ErrorCategory; code: string; retryable: boolean }>
> = {
  [ExitCode.AuthFailure]: {
    category: "auth",
    code: "AUTH_FAILURE",
    retryable: false,
  },
  [ExitCode.ResourceNotFound]: {
    category: "not_found",
    code: "RESOURCE_NOT_FOUND",
    retryable: false,
  },
  [ExitCode.RuntimeFailure]: {
    category: "server",
    code: "RUNTIME_FAILURE",
    retryable: true,
  },
  [ExitCode.StateUnavailable]: {
    category: "config",
    code: "STATE_UNAVAILABLE",
    retryable: false,
  },
  [ExitCode.UsageError]: {
    category: "validation",
    code: "USAGE_ERROR",
    retryable: false,
  },
};

const mapFailure = (error: unknown): NormalizedFailure => {
  if (error instanceof CliFailure) {
    const meta = EXIT_CODE_META[error.exitCode] ?? {
      category: "server" as const,
      code: "UNKNOWN",
      retryable: false,
    };
    return {
      category: meta.category,
      code: meta.code,
      exitCode: error.exitCode as ExitCodeType,
      message: error.message,
      retryable: meta.retryable,
      verbose: error.details,
    };
  }

  if (error instanceof ReviewNotFound || error instanceof TodoNotFound) {
    return {
      category: "not_found",
      code: "RESOURCE_NOT_FOUND",
      exitCode: ExitCode.ResourceNotFound,
      message: error.message,
      retryable: false,
      verbose: error.stack,
    };
  }

  if (error instanceof Error) {
    return {
      category: "server",
      code: "RUNTIME_FAILURE",
      exitCode: ExitCode.RuntimeFailure,
      message: error.message,
      retryable: true,
      verbose: error.stack,
    };
  }

  return {
    category: "server",
    code: "UNKNOWN_FAILURE",
    exitCode: ExitCode.RuntimeFailure,
    message: "Unknown CLI failure.",
    retryable: false,
  };
};

/** Actionable fix guidance based on error category. */
const FIX_GUIDANCE: Readonly<Record<ErrorCategory, string>> = {
  auth: "Check authentication credentials or run 'ringi serve --auth' with valid credentials.",
  config:
    "Run 'ringi serve' once to initialize local state, or check --repo and --db-path flags.",
  conflict: "Resolve the conflict and retry the operation.",
  connection: "Ensure the Ringi server is running: ringi serve",
  not_found:
    "Verify the resource ID. Use 'ringi review list' or 'ringi todo list' to find valid IDs.",
  server: "Retry the command. If the error persists, check 'ringi serve' logs.",
  validation:
    "Check command usage with 'ringi --help'. Verify flag names and values.",
};

/** Build recovery next_actions based on error category. */
const errorNextActions = (
  commandStr: string,
  normalized: NormalizedFailure
): NextAction[] => {
  const actions: NextAction[] = [];

  if (normalized.retryable) {
    actions.push({
      command: commandStr,
      description: "Retry the failed command",
    });
  }

  if (
    normalized.category === "config" ||
    normalized.category === "connection"
  ) {
    actions.push({
      command: "ringi serve",
      description: "Start the local Ringi server",
    });
  }

  if (normalized.category === "not_found") {
    actions.push(
      {
        command: "ringi review list",
        description: "List available reviews",
      },
      {
        command: "ringi todo list",
        description: "List available todos",
      }
    );
  }

  if (normalized.category === "validation") {
    actions.push({
      command: `${commandStr.split(" ").slice(0, 3).join(" ")} --help`,
      description: "Show command usage",
    });
  }

  return actions;
};

/** Build a full error envelope from a normalized failure. */
const buildErrorEnvelope = (
  commandStr: string,
  normalized: NormalizedFailure
): CliErrorEnvelope => {
  const errorDetail: CliErrorDetail = {
    category: normalized.category,
    code: normalized.code,
    message: normalized.message,
    retryable: normalized.retryable,
    type: `ringi://errors/${normalized.code}`,
  };

  return failure(
    commandStr,
    errorDetail,
    normalized.verbose ?? FIX_GUIDANCE[normalized.category],
    errorNextActions(commandStr, normalized)
  );
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
    const normalized = mapFailure(parseResult.left);
    if (process.argv.slice(2).includes("--json")) {
      writeJson(buildErrorEnvelope("ringi", normalized));
    }
    process.stderr.write(`${normalized.message}\n`);
    process.exit(normalized.exitCode);
  }

  const { command, options } = parseResult.right;

  if (command.kind === "help") {
    if (options.json) {
      writeJson(success("ringi", COMMAND_TREE, ROOT_NEXT_ACTIONS));
    } else {
      writeHuman(renderHelp(command));
    }
    process.exit(ExitCode.Success);
  }

  if (command.kind === "version") {
    if (options.json) {
      writeJson(success("ringi --version", { version: CLI_VERSION }));
    } else {
      writeHuman(CLI_VERSION);
    }
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

  const cmdStr = commandLabel(command);

  if (runtimeResources instanceof CliFailure) {
    const normalized = mapFailure(runtimeResources);
    if (options.json) {
      writeJson(buildErrorEnvelope(cmdStr, normalized));
    }
    process.stderr.write(`${normalized.message}\n`);
    process.exit(normalized.exitCode);
  }

  const removeSignalHandlers = installSignalHandlers(() =>
    runtimeResources.runtime.dispose()
  );

  try {
    const output = (await runtimeResources.runtime.runPromise(
      runCommand(command) as never
    )) as { data: unknown; human?: string; nextActions?: NextAction[] };

    if (options.json) {
      writeJson(success(cmdStr, output.data, output.nextActions ?? []));
    } else if (!options.quiet) {
      writeHuman(output.human);
    }

    await runtimeResources.runtime.dispose();
    removeSignalHandlers();
    process.exit(ExitCode.Success);
  } catch (error) {
    const normalized = mapFailure(error);

    if (options.json) {
      writeJson(buildErrorEnvelope(cmdStr, normalized));
    }

    process.stderr.write(`${normalized.message}\n`);
    if (options.verbose && normalized.verbose) {
      process.stderr.write(`${normalized.verbose}\n`);
    }

    await runtimeResources.runtime.dispose();
    removeSignalHandlers();
    process.exit(normalized.exitCode);
  }
};

try {
  await main();
} catch (error) {
  const normalized = mapFailure(error);
  const wantsJson = process.argv.slice(2).includes("--json");

  if (wantsJson) {
    writeJson(buildErrorEnvelope("ringi", normalized));
  }

  process.stderr.write(`${normalized.message}\n`);
  process.exit(normalized.exitCode);
}
