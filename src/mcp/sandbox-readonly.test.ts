import { describe, expect, it } from "vitest";

import { createSandboxGlobals } from "@/mcp/sandbox";
import type { SandboxDeps } from "@/mcp/sandbox";

const READONLY_REJECTION =
  "Mutation rejected: MCP server is running in readonly mode";

const readonlyDeps: SandboxDeps = {
  call: async (_name, fn) => fn(),
  getBranchDiff: async () => "",
  getBranches: async () => [],
  getCommitDiff: async () => "",
  getLatestReviewId: async () => null,
  getRecentCommits: async () => [],
  getRepositoryInfo: async () => ({
    branch: "main",
    name: "test",
    path: "/tmp/test",
    remote: null,
  }),
  getStagedDiff: async () => "",
  getStagedFiles: async () => [],
  readonly: true,
  repoRoot: "/tmp/test",
  requireWritable: () => {
    throw new Error(READONLY_REJECTION);
  },
};

describe("readonly enforcement", () => {
  const globals = createSandboxGlobals(readonlyDeps);

  it("reviews.create rejects in readonly mode", async () => {
    await expect(
      globals.reviews.create({ source: { type: "staged" } })
    ).rejects.toThrow(READONLY_REJECTION);
  });

  it("todos.add rejects in readonly mode", async () => {
    await expect(globals.todos.add({ text: "test" })).rejects.toThrow(
      READONLY_REJECTION
    );
  });

  it("todos.done rejects in readonly mode", async () => {
    await expect(globals.todos.done("todo_123")).rejects.toThrow(
      READONLY_REJECTION
    );
  });

  it("todos.undone rejects in readonly mode", async () => {
    await expect(globals.todos.undone("todo_123")).rejects.toThrow(
      READONLY_REJECTION
    );
  });

  it("todos.move rejects in readonly mode", async () => {
    await expect(globals.todos.move("todo_123", 1)).rejects.toThrow(
      READONLY_REJECTION
    );
  });

  it("todos.remove rejects in readonly mode", async () => {
    await expect(globals.todos.remove("todo_123")).rejects.toThrow(
      READONLY_REJECTION
    );
  });

  it("todos.clear rejects in readonly mode", async () => {
    await expect(globals.todos.clear()).rejects.toThrow(READONLY_REJECTION);
  });

  it("session.context works in readonly mode (read-only)", async () => {
    const ctx = await globals.session.context();
    expect(ctx.readonly).toBe(true);
  });

  it("sources.list works in readonly mode (read-only)", async () => {
    const result = await globals.sources.list();
    expect(result.staged).toBeDefined();
  });

  it("intelligence methods reject as phase unavailable, not readonly", async () => {
    await expect(
      globals.intelligence.getRelationships("rev_123")
    ).rejects.toThrow("phase");
  });
});
