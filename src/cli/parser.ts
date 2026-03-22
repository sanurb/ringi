import * as Either from "effect/Either";
import * as Option from "effect/Option";

import type { ReviewSourceType, ReviewStatus } from "@/api/schemas/review";
import { CliFailure, ExitCode } from "@/cli/contracts";
import type { GlobalOptions, ParsedCommand } from "@/cli/contracts";

// ---------------------------------------------------------------------------
// Shared validation sets
// ---------------------------------------------------------------------------

const REVIEW_SOURCES = new Set<ReviewSourceType>([
  "branch",
  "commits",
  "staged",
]);
const REVIEW_STATUSES = new Set<ReviewStatus>([
  "approved",
  "changes_requested",
  "in_progress",
]);
const TODO_STATUSES = new Set<string>(["all", "done", "pending"]);

// ---------------------------------------------------------------------------
// Parse state
// ---------------------------------------------------------------------------

interface ParseState {
  index: number;
  readonly options: GlobalOptions;
  readonly tokens: readonly string[];
}

type ParseResult = Either.Either<ParsedCommand, CliFailure>;

const usageError = (message: string): CliFailure =>
  new CliFailure({ exitCode: ExitCode.UsageError, message });

// ---------------------------------------------------------------------------
// Reusable value extractors
// ---------------------------------------------------------------------------

/**
 * Consumes the next token as a flag value, advancing the cursor by 2.
 * Rejects another flag in the value slot so typos fail fast.
 */
const requireValue = (
  state: ParseState,
  flag: string
): Option.Option<CliFailure> => {
  const value = state.tokens[state.index + 1];
  if (!value || value.startsWith("-")) {
    return Option.some(usageError(`Missing value for ${flag}.`));
  }
  state.index += 2;
  return Option.none();
};

/** Peek at the value that {@link requireValue} would consume. */
const peekValue = (state: ParseState): string =>
  state.tokens[state.index + 1] ?? "";

const decodePositiveInt = (
  raw: string,
  flag: string
): Either.Either<number, CliFailure> => {
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 0) {
    return Either.left(usageError(`${flag} must be a non-negative integer.`));
  }
  return Either.right(value);
};

const decodeEnum = <T extends string>(
  raw: string,
  valid: ReadonlySet<T>,
  label: string
): Either.Either<T, CliFailure> => {
  if (!valid.has(raw as T)) {
    return Either.left(usageError(`Invalid ${label}: ${raw}.`));
  }
  return Either.right(raw as T);
};

// ---------------------------------------------------------------------------
// Flag handler framework
// ---------------------------------------------------------------------------

/**
 * A flag handler receives the parse state and a mutable accumulator.
 * It returns `Option.some(CliFailure)` on error, `Option.none()` on success.
 * Cursor advancement is handled by the handler (1 for booleans, 2 for values
 * via {@link requireValue}).
 */
type FlagHandler<Acc> = (
  state: ParseState,
  acc: Acc
) => Option.Option<CliFailure>;

// -- Flag handler factories -------------------------------------------------

/** Boolean flag: sets a key to `true`, advances cursor by 1. */
const boolFlag =
  <Acc>(key: keyof Acc & string): FlagHandler<Acc> =>
  (state, acc) => {
    (acc as Record<string, unknown>)[key] = true;
    state.index += 1;
    return Option.none();
  };

/** String flag: consumes next token, assigns to key. */
const stringFlag =
  <Acc>(key: keyof Acc & string): FlagHandler<Acc> =>
  (state, acc) => {
    const flag = state.tokens[state.index] ?? "";
    const value = peekValue(state);
    const error = requireValue(state, flag);
    if (Option.isSome(error)) {
      return error;
    }
    (acc as Record<string, unknown>)[key] = value;
    return Option.none();
  };

/** Positive integer flag with an optional minimum (exclusive). */
const positiveIntFlag =
  <Acc>(
    key: keyof Acc & string,
    opts?: { readonly min?: number }
  ): FlagHandler<Acc> =>
  (state, acc) => {
    const flag = state.tokens[state.index] ?? "";
    const raw = peekValue(state);
    const error = requireValue(state, flag);
    if (Option.isSome(error)) {
      return error;
    }
    const decoded = decodePositiveInt(raw, flag);
    if (Either.isLeft(decoded)) {
      return Option.some(decoded.left);
    }
    if (opts?.min !== undefined && decoded.right <= opts.min) {
      return Option.some(
        usageError(`${flag} must be greater than ${opts.min}.`)
      );
    }
    (acc as Record<string, unknown>)[key] = decoded.right;
    return Option.none();
  };

/** Enum flag: consumes next token, validates membership, assigns to key. */
const enumFlag =
  <Acc>(
    key: keyof Acc & string,
    valid: ReadonlySet<string>,
    label: string
  ): FlagHandler<Acc> =>
  (state, acc) => {
    const flag = state.tokens[state.index] ?? "";
    const raw = peekValue(state);
    const error = requireValue(state, flag);
    if (Option.isSome(error)) {
      return error;
    }
    const decoded = decodeEnum(raw, valid, label);
    if (Either.isLeft(decoded)) {
      return Option.some(decoded.left);
    }
    (acc as Record<string, unknown>)[key] = decoded.right;
    return Option.none();
  };

// ---------------------------------------------------------------------------
// Global flags (must precede runFlagLoop which calls maybeParseGlobalFlag)
// ---------------------------------------------------------------------------

const createDefaultOptions = (): GlobalOptions => ({
  color: true,
  dbPath: undefined,
  help: false,
  json: false,
  quiet: false,
  repo: undefined,
  verbose: false,
  version: false,
});

/**
 * Global flags are accepted before or after subcommands because wrappers often
 * prepend them without preserving the CLI's preferred ordering.
 */
const GLOBAL_FLAG_HANDLERS: Readonly<
  Record<string, FlagHandler<GlobalOptions>>
> = {
  "--db-path": stringFlag("dbPath"),
  "--help": boolFlag("help"),
  "--json": boolFlag("json"),
  "--no-color": (state, acc) => {
    acc.color = false;
    state.index += 1;
    return Option.none();
  },
  "--quiet": boolFlag("quiet"),
  "--repo": stringFlag("repo"),
  "--verbose": boolFlag("verbose"),
  "--version": boolFlag("version"),
};

const maybeParseGlobalFlag = (state: ParseState): boolean => {
  const token = state.tokens[state.index];
  if (!token) {
    return false;
  }
  const handler = GLOBAL_FLAG_HANDLERS[token];
  if (!handler) {
    return false;
  }
  // Global flag handlers do not fail — they just set values.
  handler(state, state.options);
  return true;
};

// -- Generic flag loop runner -----------------------------------------------

/**
 * Consumes all remaining tokens in {@link state} by dispatching to the matching
 * handler in {@link handlers}. Global flags are tried first. Unknown flags
 * produce a usage error naming the {@link commandLabel}.
 */
const runFlagLoop = <Acc>(
  state: ParseState,
  acc: Acc,
  handlers: Readonly<Record<string, FlagHandler<Acc>>>,
  commandLabel: string
): Option.Option<CliFailure> => {
  while (state.index < state.tokens.length) {
    if (maybeParseGlobalFlag(state)) {
      continue;
    }
    const token = state.tokens[state.index] ?? "";
    const handler = handlers[token];
    if (!handler) {
      return Option.some(
        usageError(`Unknown flag for ${commandLabel}: ${token}.`)
      );
    }
    const error = handler(state, acc);
    if (Option.isSome(error)) {
      return error;
    }
  }
  return Option.none();
};

// ---------------------------------------------------------------------------
// Command parsers (table-driven)
// ---------------------------------------------------------------------------

// -- review list ------------------------------------------------------------

interface ReviewListAcc {
  limit: number;
  page: number;
  source: ReviewSourceType | undefined;
  status: ReviewStatus | undefined;
}

const REVIEW_LIST_FLAGS: Readonly<Record<string, FlagHandler<ReviewListAcc>>> =
  {
    "--limit": positiveIntFlag("limit", { min: 0 }),
    "--page": positiveIntFlag("page", { min: 0 }),
    "--source": enumFlag("source", REVIEW_SOURCES, "review source"),
    "--status": enumFlag("status", REVIEW_STATUSES, "review status"),
  };

const parseReviewList = (state: ParseState): ParseResult => {
  const acc: ReviewListAcc = {
    limit: 20,
    page: 1,
    source: undefined,
    status: undefined,
  };
  const error = runFlagLoop(state, acc, REVIEW_LIST_FLAGS, "review list");
  if (Option.isSome(error)) {
    return Either.left(error.value);
  }
  return Either.right({ kind: "review-list" as const, ...acc });
};

// -- review show ------------------------------------------------------------

interface ReviewShowAcc {
  comments: boolean;
  todos: boolean;
}

const REVIEW_SHOW_FLAGS: Readonly<Record<string, FlagHandler<ReviewShowAcc>>> =
  {
    "--comments": boolFlag("comments"),
    "--todos": boolFlag("todos"),
  };

const parseReviewShow = (state: ParseState): ParseResult => {
  const id = state.tokens[state.index];
  if (!id) {
    return Either.left(usageError("review show requires <id|last>."));
  }
  state.index += 1;

  const acc: ReviewShowAcc = { comments: false, todos: false };
  const error = runFlagLoop(state, acc, REVIEW_SHOW_FLAGS, "review show");
  if (Option.isSome(error)) {
    return Either.left(error.value);
  }
  return Either.right({ id, kind: "review-show" as const, ...acc });
};

// -- review export ----------------------------------------------------------

interface ReviewExportAcc {
  noResolved: boolean;
  noSnippets: boolean;
  outputPath: string | undefined;
  stdout: boolean;
}

const REVIEW_EXPORT_FLAGS: Readonly<
  Record<string, FlagHandler<ReviewExportAcc>>
> = {
  "--no-resolved": boolFlag("noResolved"),
  "--no-snippets": boolFlag("noSnippets"),
  "--output": stringFlag("outputPath"),
  "--stdout": boolFlag("stdout"),
};

const parseReviewExport = (state: ParseState): ParseResult => {
  const id = state.tokens[state.index];
  if (!id) {
    return Either.left(usageError("review export requires <id|last>."));
  }
  state.index += 1;

  const acc: ReviewExportAcc = {
    noResolved: false,
    noSnippets: false,
    outputPath: undefined,
    stdout: false,
  };
  const error = runFlagLoop(state, acc, REVIEW_EXPORT_FLAGS, "review export");
  if (Option.isSome(error)) {
    return Either.left(error.value);
  }
  return Either.right({ id, kind: "review-export" as const, ...acc });
};

// -- review create ----------------------------------------------------------

interface ReviewCreateAcc {
  branch: string | undefined;
  commits: string | undefined;
  source: ReviewSourceType;
  title: string | undefined;
}

const REVIEW_CREATE_FLAGS: Readonly<
  Record<string, FlagHandler<ReviewCreateAcc>>
> = {
  "--branch": stringFlag("branch"),
  "--commits": stringFlag("commits"),
  "--source": enumFlag("source", REVIEW_SOURCES, "review source"),
  "--title": stringFlag("title"),
};

const validateReviewCreate = (
  acc: ReviewCreateAcc
): Option.Option<CliFailure> => {
  if (acc.source === "branch" && !acc.branch) {
    return Option.some(
      usageError("review create --source branch requires --branch.")
    );
  }
  if (acc.source === "commits" && !acc.commits) {
    return Option.some(
      usageError("review create --source commits requires --commits.")
    );
  }
  if (acc.source === "staged" && (acc.branch || acc.commits)) {
    return Option.some(
      usageError(
        "review create --source staged does not accept --branch or --commits."
      )
    );
  }
  return Option.none();
};

const parseReviewCreate = (state: ParseState): ParseResult => {
  const acc: ReviewCreateAcc = {
    branch: undefined,
    commits: undefined,
    source: "staged",
    title: undefined,
  };
  const error = runFlagLoop(state, acc, REVIEW_CREATE_FLAGS, "review create");
  if (Option.isSome(error)) {
    return Either.left(error.value);
  }
  const validationError = validateReviewCreate(acc);
  if (Option.isSome(validationError)) {
    return Either.left(validationError.value);
  }
  return Either.right({ kind: "review-create" as const, ...acc });
};

// -- source diff ------------------------------------------------------------

interface SourceDiffAcc {
  branch: string | undefined;
  commits: string | undefined;
  stat: boolean;
}

const SOURCE_DIFF_FLAGS: Readonly<Record<string, FlagHandler<SourceDiffAcc>>> =
  {
    "--branch": stringFlag("branch"),
    "--commits": stringFlag("commits"),
    "--stat": boolFlag("stat"),
  };

const validateSourceDiff = (
  source: ReviewSourceType,
  acc: SourceDiffAcc
): Option.Option<CliFailure> => {
  if (source === "branch" && !acc.branch) {
    return Option.some(usageError("source diff branch requires --branch."));
  }
  if (source === "commits" && !acc.commits) {
    return Option.some(usageError("source diff commits requires --commits."));
  }
  return Option.none();
};

const parseSourceDiff = (state: ParseState): ParseResult => {
  const source = state.tokens[state.index] as ReviewSourceType | undefined;
  if (!source || !REVIEW_SOURCES.has(source)) {
    return Either.left(
      usageError("source diff requires <staged|branch|commits>.")
    );
  }
  state.index += 1;

  const acc: SourceDiffAcc = {
    branch: undefined,
    commits: undefined,
    stat: false,
  };
  const error = runFlagLoop(state, acc, SOURCE_DIFF_FLAGS, "source diff");
  if (Option.isSome(error)) {
    return Either.left(error.value);
  }
  const validationError = validateSourceDiff(source, acc);
  if (Option.isSome(validationError)) {
    return Either.left(validationError.value);
  }
  return Either.right({ kind: "source-diff" as const, source, ...acc });
};

// -- todo list --------------------------------------------------------------

interface TodoListAcc {
  limit: number | undefined;
  offset: number;
  reviewId: string | undefined;
  status: "all" | "done" | "pending";
}

const TODO_LIST_FLAGS: Readonly<Record<string, FlagHandler<TodoListAcc>>> = {
  "--limit": positiveIntFlag("limit"),
  "--offset": positiveIntFlag("offset"),
  "--review": stringFlag("reviewId"),
  "--status": enumFlag("status", TODO_STATUSES, "todo status"),
};

const parseTodoList = (state: ParseState): ParseResult => {
  const acc: TodoListAcc = {
    limit: undefined,
    offset: 0,
    reviewId: undefined,
    status: "pending",
  };
  const error = runFlagLoop(state, acc, TODO_LIST_FLAGS, "todo list");
  if (Option.isSome(error)) {
    return Either.left(error.value);
  }
  return Either.right({ kind: "todo-list" as const, ...acc });
};

// -- todo add ---------------------------------------------------------------

interface TodoAddAcc {
  position: number | undefined;
  reviewId: string | undefined;
  text: string;
}

const TODO_ADD_FLAGS: Readonly<Record<string, FlagHandler<TodoAddAcc>>> = {
  "--position": positiveIntFlag("position"),
  "--review": stringFlag("reviewId"),
  "--text": stringFlag("text"),
};

const parseTodoAdd = (state: ParseState): ParseResult => {
  const acc: TodoAddAcc = {
    position: undefined,
    reviewId: undefined,
    text: "",
  };
  const error = runFlagLoop(state, acc, TODO_ADD_FLAGS, "todo add");
  if (Option.isSome(error)) {
    return Either.left(error.value);
  }
  if (!acc.text.trim()) {
    return Either.left(usageError("todo add requires --text."));
  }
  return Either.right({ kind: "todo-add" as const, ...acc });
};

// ---------------------------------------------------------------------------
// Command family dispatch (lookup tables)
// ---------------------------------------------------------------------------

const ensureNoExtraArgs = (
  state: ParseState,
  label: string
): Option.Option<CliFailure> => {
  if (state.index < state.tokens.length) {
    return Option.some(
      usageError(
        `Unexpected argument for ${label}: ${state.tokens[state.index]}.`
      )
    );
  }
  return Option.none();
};

/** Review verb parsers keyed by verb name. */
const REVIEW_VERB_PARSERS: Readonly<
  Record<string, (state: ParseState) => ParseResult>
> = {
  create: parseReviewCreate,
  export: parseReviewExport,
  list: parseReviewList,
  show: parseReviewShow,
};

/** Todo verb parsers keyed by verb name. */
const TODO_VERB_PARSERS: Readonly<
  Record<string, (state: ParseState) => ParseResult>
> = {
  add: parseTodoAdd,
  list: parseTodoList,
};

/** Subcommand family parsers keyed by family name. */
const FAMILY_PARSERS: Readonly<
  Record<string, (state: ParseState) => ParseResult>
> = {
  export: parseReviewExport,
  review: (state) => {
    const verb = state.tokens[state.index];
    if (!verb) {
      return Either.right({
        kind: "help" as const,
        topic: ["review"] as const,
      });
    }
    state.index += 1;
    const parser = REVIEW_VERB_PARSERS[verb];
    if (!parser) {
      return Either.left(usageError(`Unknown review command: ${verb}.`));
    }
    return parser(state);
  },
  source: (state) => {
    const verb = state.tokens[state.index];
    if (!verb) {
      return Either.right({
        kind: "help" as const,
        topic: ["source"] as const,
      });
    }
    state.index += 1;
    if (verb === "list") {
      const error = ensureNoExtraArgs(state, "source list");
      if (Option.isSome(error)) {
        return Either.left(error.value);
      }
      return Either.right({ kind: "source-list" as const });
    }
    if (verb === "diff") {
      return parseSourceDiff(state);
    }
    return Either.left(usageError(`Unknown source command: ${verb}.`));
  },
  todo: (state) => {
    const verb = state.tokens[state.index];
    if (!verb) {
      return Either.right({
        kind: "help" as const,
        topic: ["todo"] as const,
      });
    }
    state.index += 1;
    const parser = TODO_VERB_PARSERS[verb];
    if (!parser) {
      return Either.left(usageError(`Unknown todo command: ${verb}.`));
    }
    return parser(state);
  },
};

// ---------------------------------------------------------------------------
// Top-level entry
// ---------------------------------------------------------------------------

/**
 * Strips any leading globals with {@link maybeParseGlobalFlag} before dispatching
 * into a command family so `--help` and `--version` behave consistently.
 */
const parseWithState = (state: ParseState): ParseResult => {
  while (state.index < state.tokens.length && maybeParseGlobalFlag(state)) {
    // Keep consuming top-level flags before the command token.
  }

  if (state.options.version) {
    return Either.right({ kind: "version" as const });
  }

  if (state.index >= state.tokens.length) {
    return Either.right({ kind: "help" as const, topic: [] });
  }

  const first = state.tokens[state.index];
  if (!first) {
    return Either.right({ kind: "help" as const, topic: [] });
  }
  if (first === "help") {
    const topic = state.tokens.slice(state.index + 1);
    state.index = state.tokens.length;
    return Either.right({ kind: "help" as const, topic });
  }

  if (state.options.help) {
    return Either.right({
      kind: "help" as const,
      topic: state.tokens.slice(state.index),
    });
  }

  state.index += 1;

  const familyParser = FAMILY_PARSERS[first];
  if (!familyParser) {
    return Either.left(usageError(`Unknown command: ${first}.`));
  }
  return familyParser(state);
};

export const parseCliArgs = (
  argv: readonly string[]
): Either.Either<
  { readonly command: ParsedCommand; readonly options: GlobalOptions },
  CliFailure
> => {
  const options = createDefaultOptions();
  const state: ParseState = { index: 0, options, tokens: argv };
  const result = parseWithState(state);
  if (Either.isLeft(result)) {
    return Either.left(result.left);
  }
  return Either.right({ command: result.right, options });
};
