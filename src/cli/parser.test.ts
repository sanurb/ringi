import * as Either from "effect/Either";
import { describe, expect, it } from "vitest";

import { parseCliArgs } from "@/cli/parser";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const parse = (argv: string[]) => {
  const result = parseCliArgs(argv);
  if (Either.isLeft(result)) {
    return { error: result.left.message };
  }
  return result.right;
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
  if (Either.isRight(result)) {
    throw new Error(
      `Expected parse failure but got: ${result.right.command.kind}`
    );
  }
  return result.left;
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
