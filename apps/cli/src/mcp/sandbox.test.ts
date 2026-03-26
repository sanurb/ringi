import { describe, expect, it } from "vitest";

import { createSandboxGlobals } from "@/mcp/sandbox";
import type { SandboxDeps } from "@/mcp/sandbox";

// ---------------------------------------------------------------------------
// Stub dependencies (no real Effect runtime needed)
// ---------------------------------------------------------------------------

const stubDeps: SandboxDeps = {
  call: async (_name, fn) => fn(),
  getBranchDiff: async () => "",
  getBranches: async () => [],
  getCommitDiff: async () => "",
  getLatestReviewId: async () => null,
  getRecentCommits: async () => [],
  getRepositoryInfo: async () => ({
    branch: "main",
    name: "test-repo",
    path: "/tmp/test-repo",
    remote: null,
  }),
  getStagedDiff: async () => "",
  getStagedFiles: async () => [],
  readonly: false,
  repoRoot: "/tmp/test-repo",
  requireWritable: () => {},
};

// ---------------------------------------------------------------------------
// Namespace presence
// ---------------------------------------------------------------------------

describe("sandbox globals", () => {
  const globals = createSandboxGlobals(stubDeps);

  it("exposes 'reviews' namespace (not 'review')", () => {
    expect(globals).toHaveProperty("reviews");
    expect(globals).not.toHaveProperty("review");
  });

  it("exposes 'todos' namespace (not 'todo')", () => {
    expect(globals).toHaveProperty("todos");
    expect(globals).not.toHaveProperty("todo");
  });

  it("exposes 'sources' namespace", () => {
    expect(globals).toHaveProperty("sources");
  });

  it("exposes 'intelligence' namespace", () => {
    expect(globals).toHaveProperty("intelligence");
  });

  it("exposes 'events' namespace", () => {
    expect(globals).toHaveProperty("events");
  });

  it("exposes 'session' namespace", () => {
    expect(globals).toHaveProperty("session");
  });

  it("does not expose legacy 'comment' namespace", () => {
    expect(globals).not.toHaveProperty("comment");
  });

  it("does not expose legacy 'diff' namespace", () => {
    expect(globals).not.toHaveProperty("diff");
  });

  it("does not expose legacy 'export' namespace", () => {
    expect(globals).not.toHaveProperty("export");
  });

  it("has exactly 6 namespaces", () => {
    expect(Object.keys(globals)).toHaveLength(6);
    expect(Object.keys(globals).toSorted()).toEqual([
      "events",
      "intelligence",
      "reviews",
      "session",
      "sources",
      "todos",
    ]);
  });
});

// ---------------------------------------------------------------------------
// reviews namespace methods
// ---------------------------------------------------------------------------

describe("reviews namespace methods", () => {
  const globals = createSandboxGlobals(stubDeps);
  const { reviews } = globals;

  it("has list method", () => {
    expect(typeof reviews.list).toBe("function");
  });

  it("has get method", () => {
    expect(typeof reviews.get).toBe("function");
  });

  it("has getFiles method", () => {
    expect(typeof reviews.getFiles).toBe("function");
  });

  it("has getDiff method", () => {
    expect(typeof reviews.getDiff).toBe("function");
  });

  it("has getComments method", () => {
    expect(typeof reviews.getComments).toBe("function");
  });

  it("has getSuggestions method", () => {
    expect(typeof reviews.getSuggestions).toBe("function");
  });

  it("has getStatus method", () => {
    expect(typeof reviews.getStatus).toBe("function");
  });

  it("has export method", () => {
    expect(typeof reviews.export).toBe("function");
  });

  it("has create method", () => {
    expect(typeof reviews.create).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// todos namespace methods
// ---------------------------------------------------------------------------

describe("todos namespace methods", () => {
  const globals = createSandboxGlobals(stubDeps);
  const { todos } = globals;

  it("has list method", () => {
    expect(typeof todos.list).toBe("function");
  });

  it("has add method", () => {
    expect(typeof todos.add).toBe("function");
  });

  it("has done method", () => {
    expect(typeof todos.done).toBe("function");
  });

  it("has undone method", () => {
    expect(typeof todos.undone).toBe("function");
  });

  it("has move method", () => {
    expect(typeof todos.move).toBe("function");
  });

  it("has remove method", () => {
    expect(typeof todos.remove).toBe("function");
  });

  it("has clear method", () => {
    expect(typeof todos.clear).toBe("function");
  });
});
