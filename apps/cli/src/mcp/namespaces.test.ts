import { describe, expect, it } from "vitest";

import {
  PHASE_UNAVAILABLE_MESSAGE,
  createIntelligenceNamespace,
  createSessionNamespace,
  createSourcesNamespace,
  createEventsNamespace,
} from "@/mcp/namespaces";

// ---------------------------------------------------------------------------
// intelligence namespace — phase unavailable
// ---------------------------------------------------------------------------

describe("intelligence namespace", () => {
  const ns = createIntelligenceNamespace();

  it("getRelationships rejects as phase unavailable", async () => {
    await expect(ns.getRelationships("rev_123")).rejects.toThrow(
      PHASE_UNAVAILABLE_MESSAGE
    );
  });

  it("getImpacts rejects as phase unavailable", async () => {
    await expect(ns.getImpacts("rev_123")).rejects.toThrow(
      PHASE_UNAVAILABLE_MESSAGE
    );
  });

  it("getConfidence rejects as phase unavailable", async () => {
    await expect(ns.getConfidence("rev_123")).rejects.toThrow(
      PHASE_UNAVAILABLE_MESSAGE
    );
  });

  it("validate rejects as phase unavailable", async () => {
    await expect(
      ns.validate({ checks: ["unresolved_comments"], reviewId: "rev_123" })
    ).rejects.toThrow(PHASE_UNAVAILABLE_MESSAGE);
  });
});

// ---------------------------------------------------------------------------
// session namespace
// ---------------------------------------------------------------------------

describe("session namespace", () => {
  const mockGitInfo = {
    branch: "main",
    name: "ringi",
    path: "/tmp/ringi",
    remote: null as string | null,
  };

  const ns = createSessionNamespace({
    getLatestReviewId: async () => "rev_latest",
    getRepositoryInfo: async () => mockGitInfo,
    readonly: true,
  });

  it("context returns repository info and readonly state", async () => {
    const ctx = await ns.context();
    expect(ctx.repository.name).toBe("ringi");
    expect(ctx.readonly).toBe(true);
    expect(ctx.serverMode).toBe("stdio");
    expect(ctx.activeReviewId).toBe("rev_latest");
  });

  it("status returns server health", async () => {
    const status = await ns.status();
    expect(status.ok).toBe(true);
    expect(status.readonly).toBe(true);
    expect(status.currentPhase).toBe("phase1");
  });
});

// ---------------------------------------------------------------------------
// sources namespace
// ---------------------------------------------------------------------------

describe("sources namespace", () => {
  const ns = createSourcesNamespace({
    getBranchDiff: async (_branch: string) => "",
    getBranches: async () => [
      { current: true, name: "main" },
      { current: false, name: "feature" },
    ],
    getCommitDiff: async (_shas: string[]) => "",
    getRecentCommits: async () => [
      { author: "dev", date: "2026-03-25", hash: "abc1234", message: "init" },
    ],
    getRepositoryInfo: async () => ({
      branch: "main",
      name: "test-repo",
      path: "/tmp/test",
      remote: null,
    }),
    getStagedDiff: async () =>
      "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,2 @@\n line1\n+line2\n",
    getStagedFiles: async () => [{ path: "src/a.ts", status: "M" }],
  });

  it("list returns staged availability, branches, and commits", async () => {
    const result = await ns.list();
    expect(result.staged.available).toBe(true);
    expect(result.branches).toHaveLength(2);
    expect(result.recentCommits).toHaveLength(1);
  });

  it("previewDiff returns summary for staged source", async () => {
    const result = await ns.previewDiff({ type: "staged" });
    expect(result.source).toEqual({ type: "staged" });
    expect(result.summary.totalFiles).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// events namespace
// ---------------------------------------------------------------------------

describe("events namespace", () => {
  const ns = createEventsNamespace();

  it("subscribe returns a subscription object", async () => {
    const sub = await ns.subscribe({
      eventTypes: ["reviews.updated"],
    });
    expect(sub.id).toBeDefined();
    expect(sub.eventTypes).toEqual(["reviews.updated"]);
  });

  it("listRecent returns an empty array (no events buffered)", async () => {
    const events = await ns.listRecent({ limit: 10 });
    expect(events).toEqual([]);
  });
});
