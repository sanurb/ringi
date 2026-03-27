import * as Result from "effect/Result";
import { describe, expect, it } from "vitest";

import { parseCliArgs } from "@/cli/parser";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const parse = (argv: string[]) => {
  const result = parseCliArgs(argv);
  if (Result.isFailure(result)) {
    return { error: result.failure.message };
  }
  return result.success;
};

const parseCommand = (argv: string[]) => {
  const result = parse(argv);
  if ("error" in result) {
    throw new Error(`Parse failed: ${result.error}`);
  }
  return result.command;
};

const parseError = (argv: string[]) => {
  const result = parseCliArgs(argv);
  if (Result.isSuccess(result)) {
    throw new Error(
      `Expected parse failure but got: ${result.success.command.kind}`
    );
  }
  return result.failure;
};

// ---------------------------------------------------------------------------
// Existing command regressions
// ---------------------------------------------------------------------------

describe("existing commands still parse", () => {
  it("review list", () => {
    expect(parseCommand(["review", "list"]).kind).toBe("review-list");
  });
  it("review show last", () => {
    expect(parseCommand(["review", "show", "last"]).kind).toBe("review-show");
  });
  it("review export last", () => {
    expect(parseCommand(["review", "export", "last"]).kind).toBe(
      "review-export"
    );
  });
  it("review create", () => {
    expect(parseCommand(["review", "create"]).kind).toBe("review-create");
  });
  it("source list", () => {
    expect(parseCommand(["source", "list"]).kind).toBe("source-list");
  });
  it("source diff staged", () => {
    expect(parseCommand(["source", "diff", "staged"]).kind).toBe("source-diff");
  });
  it("todo list", () => {
    expect(parseCommand(["todo", "list"]).kind).toBe("todo-list");
  });
  it("todo add --text hello", () => {
    expect(parseCommand(["todo", "add", "--text", "hello"]).kind).toBe(
      "todo-add"
    );
  });
});

// ---------------------------------------------------------------------------
// td-done
// ---------------------------------------------------------------------------

describe("parse: todo-done", () => {
  it("parses a valid todo id", () => {
    const cmd = parseCommand(["todo", "done", "todo_abc123"]);
    expect(cmd).toEqual({ id: "todo_abc123", kind: "todo-done" });
  });

  it("rejects missing id", () => {
    const err = parseError(["todo", "done"]);
    expect(err.message).toContain("requires");
  });

  it("accepts global --json flag", () => {
    const result = parse(["todo", "done", "todo_abc123", "--json"]);
    expect(result).toHaveProperty("options.json", true);
  });
});

// ---------------------------------------------------------------------------
// td-undone
// ---------------------------------------------------------------------------

describe("parse: todo-undone", () => {
  it("parses a valid todo id", () => {
    const cmd = parseCommand(["todo", "undone", "todo_abc123"]);
    expect(cmd).toEqual({ id: "todo_abc123", kind: "todo-undone" });
  });

  it("rejects missing id", () => {
    const err = parseError(["todo", "undone"]);
    expect(err.message).toContain("requires");
  });
});

// ---------------------------------------------------------------------------
// td-move
// ---------------------------------------------------------------------------

describe("parse: todo-move", () => {
  it("parses id and position", () => {
    const cmd = parseCommand([
      "todo",
      "move",
      "todo_abc123",
      "--position",
      "3",
    ]);
    expect(cmd).toEqual({ id: "todo_abc123", kind: "todo-move", position: 3 });
  });

  it("rejects missing position", () => {
    const err = parseError(["todo", "move", "todo_abc123"]);
    expect(err.message).toContain("--position");
  });

  it("rejects missing id", () => {
    const err = parseError(["todo", "move"]);
    expect(err.message).toContain("requires");
  });
});

// ---------------------------------------------------------------------------
// td-remove
// ---------------------------------------------------------------------------

describe("parse: todo-remove", () => {
  it("parses id without --yes", () => {
    const cmd = parseCommand(["todo", "remove", "todo_abc123"]);
    expect(cmd).toEqual({ id: "todo_abc123", kind: "todo-remove", yes: false });
  });

  it("parses id with --yes", () => {
    const cmd = parseCommand(["todo", "remove", "todo_abc123", "--yes"]);
    expect(cmd).toEqual({ id: "todo_abc123", kind: "todo-remove", yes: true });
  });

  it("rejects missing id", () => {
    const err = parseError(["todo", "remove"]);
    expect(err.message).toContain("requires");
  });
});

// ---------------------------------------------------------------------------
// td-clear
// ---------------------------------------------------------------------------

describe("parse: todo-clear", () => {
  it("parses with defaults", () => {
    const cmd = parseCommand(["todo", "clear"]);
    expect(cmd).toEqual({
      all: false,
      doneOnly: true,
      kind: "todo-clear",
      reviewId: undefined,
      yes: false,
    });
  });

  it("parses --all --yes --review", () => {
    const cmd = parseCommand([
      "todo",
      "clear",
      "--all",
      "--yes",
      "--review",
      "rvw_123",
    ]);
    expect(cmd).toEqual({
      all: true,
      doneOnly: true,
      kind: "todo-clear",
      reviewId: "rvw_123",
      yes: true,
    });
  });
});

// ---------------------------------------------------------------------------
// review status
// ---------------------------------------------------------------------------

describe("parse: review-status", () => {
  it("parses with no flags", () => {
    const cmd = parseCommand(["review", "status"]);
    expect(cmd).toEqual({
      kind: "review-status",
      reviewId: undefined,
      source: undefined,
    });
  });

  it("parses --review and --source", () => {
    const cmd = parseCommand([
      "review",
      "status",
      "--review",
      "last",
      "--source",
      "staged",
    ]);
    expect(cmd).toEqual({
      kind: "review-status",
      reviewId: "last",
      source: "staged",
    });
  });

  it("rejects invalid source", () => {
    const err = parseError(["review", "status", "--source", "invalid"]);
    expect(err.message).toContain("Invalid");
  });
});

// ---------------------------------------------------------------------------
// review resolve
// ---------------------------------------------------------------------------

describe("parse: review-resolve", () => {
  it("parses id with defaults", () => {
    const cmd = parseCommand(["review", "resolve", "last"]);
    expect(cmd).toEqual({
      allComments: true,
      id: "last",
      kind: "review-resolve",
      yes: false,
    });
  });

  it("parses --yes flag", () => {
    const cmd = parseCommand(["review", "resolve", "rvw_123", "--yes"]);
    expect(cmd).toEqual({
      allComments: true,
      id: "rvw_123",
      kind: "review-resolve",
      yes: true,
    });
  });

  it("rejects missing id", () => {
    const err = parseError(["review", "resolve"]);
    expect(err.message).toContain("requires");
  });
});

// ---------------------------------------------------------------------------
// serve
// ---------------------------------------------------------------------------

describe("parse: serve", () => {
  it("parses with defaults", () => {
    const cmd = parseCommand(["serve"]);
    expect(cmd).toEqual({
      auth: false,
      host: "127.0.0.1",
      https: false,
      kind: "serve",
      noOpen: false,
      port: 3000,
    });
  });

  it("parses --port and --host", () => {
    const cmd = parseCommand(["serve", "--port", "4123", "--host", "0.0.0.0"]);
    expect(cmd).toMatchObject({ host: "0.0.0.0", kind: "serve", port: 4123 });
  });

  it("parses --no-open", () => {
    const cmd = parseCommand(["serve", "--no-open"]);
    expect(cmd).toMatchObject({ kind: "serve", noOpen: true });
  });

  it("parses --auth with credentials", () => {
    const cmd = parseCommand([
      "serve",
      "--auth",
      "--username",
      "admin",
      "--password",
      "secret",
    ]);
    expect(cmd).toMatchObject({
      auth: true,
      kind: "serve",
      password: "secret",
      username: "admin",
    });
  });
});

// ---------------------------------------------------------------------------
// mcp
// ---------------------------------------------------------------------------

describe("parse: mcp", () => {
  it("parses with defaults", () => {
    const cmd = parseCommand(["mcp"]);
    expect(cmd).toEqual({
      kind: "mcp",
      logLevel: "error",
      readonly: false,
    });
  });

  it("parses --readonly", () => {
    const cmd = parseCommand(["mcp", "--readonly"]);
    expect(cmd).toMatchObject({ kind: "mcp", readonly: true });
  });

  it("parses --log-level", () => {
    const cmd = parseCommand(["mcp", "--log-level", "debug"]);
    expect(cmd).toMatchObject({ kind: "mcp", logLevel: "debug" });
  });

  it("rejects invalid log level", () => {
    const err = parseError(["mcp", "--log-level", "invalid"]);
    expect(err.message).toContain("Invalid");
  });
});

// ---------------------------------------------------------------------------
// doctor
// ---------------------------------------------------------------------------

describe("parse: doctor", () => {
  it("parses with no flags", () => {
    const cmd = parseCommand(["doctor"]);
    expect(cmd).toEqual({ kind: "doctor" });
  });
});

// ---------------------------------------------------------------------------
// data
// ---------------------------------------------------------------------------

describe("parse: data", () => {
  it("data migrate parses", () => {
    const cmd = parseCommand(["data", "migrate"]);
    expect(cmd).toEqual({ kind: "data-migrate" });
  });

  it("data reset parses with defaults", () => {
    const cmd = parseCommand(["data", "reset"]);
    expect(cmd).toEqual({
      keepExports: false,
      kind: "data-reset",
      yes: false,
    });
  });

  it("data reset parses --yes --keep-exports", () => {
    const cmd = parseCommand(["data", "reset", "--yes", "--keep-exports"]);
    expect(cmd).toEqual({
      keepExports: true,
      kind: "data-reset",
      yes: true,
    });
  });

  it("data with no subcommand shows help", () => {
    const cmd = parseCommand(["data"]);
    expect(cmd).toEqual({ kind: "help", topic: ["data"] });
  });

  it("rejects unknown data subcommand", () => {
    const err = parseError(["data", "nope"]);
    expect(err.message).toContain("Unknown");
  });
});

// ---------------------------------------------------------------------------
// events
// ---------------------------------------------------------------------------

describe("parse: events", () => {
  it("parses with no flags", () => {
    const cmd = parseCommand(["events"]);
    expect(cmd).toEqual({
      kind: "events",
      since: undefined,
      type: undefined,
    });
  });

  it("parses --type", () => {
    const cmd = parseCommand(["events", "--type", "files"]);
    expect(cmd).toMatchObject({ kind: "events", type: "files" });
  });

  it("rejects invalid event type", () => {
    const err = parseError(["events", "--type", "invalid"]);
    expect(err.message).toContain("Invalid");
  });
});

// ---------------------------------------------------------------------------
// review <pr-url> (PR URL shortcut)
// ---------------------------------------------------------------------------

describe("review <pr-url>", () => {
  it("parses a GitHub PR URL as review-pr command", () => {
    const cmd = parseCommand([
      "review",
      "https://github.com/owner/repo/pull/42",
    ]);
    expect(cmd).toMatchObject({
      forceRefresh: false,
      kind: "review-pr",
      noOpen: false,
      port: 3000,
      prUrl: "https://github.com/owner/repo/pull/42",
    });
  });

  it("parses PR URL with flags", () => {
    const cmd = parseCommand([
      "review",
      "https://github.com/octocat/hello/pull/7",
      "--no-open",
      "--port",
      "4123",
      "--force-refresh",
    ]);
    expect(cmd).toMatchObject({
      forceRefresh: true,
      kind: "review-pr",
      noOpen: true,
      port: 4123,
      prUrl: "https://github.com/octocat/hello/pull/7",
    });
  });

  it("parses GHE PR URL", () => {
    const cmd = parseCommand([
      "review",
      "https://ghe.corp.com/team/project/pull/123",
    ]);
    expect(cmd).toMatchObject({
      kind: "review-pr",
      prUrl: "https://ghe.corp.com/team/project/pull/123",
    });
  });

  it("does not confuse review verbs with PR URLs", () => {
    const cmd = parseCommand(["review", "list"]);
    expect(cmd).toMatchObject({ kind: "review-list" });
  });

  it("supports global flags alongside PR URL", () => {
    const result = parse(["review", "https://github.com/a/b/pull/1", "--json"]);
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.command).toMatchObject({ kind: "review-pr" });
      expect(result.options.json).toBe(true);
    }
  });

  it("rejects unknown flags after PR URL", () => {
    const err = parseError([
      "review",
      "https://github.com/a/b/pull/1",
      "--invalid",
    ]);
    expect(err.message).toContain("Unknown flag");
  });
});
