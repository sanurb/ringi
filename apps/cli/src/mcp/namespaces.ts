/**
 * MCP sandbox namespace factories.
 *
 * Each factory creates a frozen namespace object suitable for injection into the
 * vm.Context sandbox. Factories accept dependency-injected callbacks so they can
 * be tested without an Effect runtime.
 */

import { parseDiff, getDiffSummary } from "@ringi/core/services/diff.service";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PHASE_UNAVAILABLE_MESSAGE =
  "This capability is not available in the current server phase. Intelligence features require Phase 2.";

// ---------------------------------------------------------------------------
// Types (match docs/MCP.md contracts)
// ---------------------------------------------------------------------------

type ReviewEventType =
  | "reviews.updated"
  | "comments.updated"
  | "todos.updated"
  | "files.changed";

interface EventSubscription {
  id: string;
  eventTypes: ReviewEventType[];
  reviewId?: string;
}

interface ReviewEvent {
  type: ReviewEventType;
  reviewId?: string;
  timestamp: number;
  payload?: unknown;
}

type ReviewSource =
  | { type: "staged" }
  | { type: "branch"; baseRef: string; headRef: string }
  | { type: "commits"; commits: string[] };

// ---------------------------------------------------------------------------
// intelligence namespace — Phase 2+, all methods fail as phase unavailable
// ---------------------------------------------------------------------------

export const createIntelligenceNamespace = () =>
  Object.freeze({
    getConfidence: (_reviewId: string): Promise<never> =>
      Promise.reject(new Error(PHASE_UNAVAILABLE_MESSAGE)),
    getImpacts: (_reviewId: string): Promise<never> =>
      Promise.reject(new Error(PHASE_UNAVAILABLE_MESSAGE)),
    getRelationships: (_reviewId: string): Promise<never> =>
      Promise.reject(new Error(PHASE_UNAVAILABLE_MESSAGE)),
    validate: (_options: {
      reviewId: string;
      checks?: string[];
    }): Promise<never> => Promise.reject(new Error(PHASE_UNAVAILABLE_MESSAGE)),
  });

// ---------------------------------------------------------------------------
// session namespace
// ---------------------------------------------------------------------------

interface SessionDeps {
  readonly: boolean;
  getRepositoryInfo: () => Promise<{
    name: string;
    path: string;
    branch: string;
    remote: string | null;
  }>;
  getLatestReviewId: () => Promise<string | null>;
}

export const createSessionNamespace = (deps: SessionDeps) =>
  Object.freeze({
    context: async () => {
      const repo = await deps.getRepositoryInfo();
      const activeReviewId = await deps.getLatestReviewId();
      return {
        activeReviewId,
        activeSnapshotId: null as string | null,
        readonly: deps.readonly,
        repository: repo,
        serverMode: "stdio" as const,
      };
    },
    status: async () => ({
      activeSubscriptions: 0,
      currentPhase: "phase1" as const,
      ok: true as const,
      readonly: deps.readonly,
    }),
  });

// ---------------------------------------------------------------------------
// sources namespace
// ---------------------------------------------------------------------------

interface SourcesDeps {
  getRepositoryInfo: () => Promise<{
    name: string;
    path: string;
    branch: string;
    remote: string | null;
  }>;
  getStagedFiles: () => Promise<readonly { path: string; status: string }[]>;
  getBranches: () => Promise<readonly { name: string; current: boolean }[]>;
  getRecentCommits: () => Promise<
    readonly { hash: string; author: string; date: string; message: string }[]
  >;
  getStagedDiff: () => Promise<string>;
  getBranchDiff: (branch: string) => Promise<string>;
  getCommitDiff: (shas: string[]) => Promise<string>;
}

const buildPreview = (diffText: string, source: ReviewSource) => {
  const files = parseDiff(diffText);
  const summary = getDiffSummary(files);
  return {
    files: files.map((f) => ({
      additions: f.additions,
      deletions: f.deletions,
      path: f.newPath,
      status: f.status,
    })),
    source,
    summary: {
      totalAdditions: summary.totalAdditions,
      totalDeletions: summary.totalDeletions,
      totalFiles: summary.totalFiles,
    },
  };
};

export const createSourcesNamespace = (deps: SourcesDeps) =>
  Object.freeze({
    list: async () => {
      const [stagedFiles, branches, commits] = await Promise.all([
        deps.getStagedFiles(),
        deps.getBranches(),
        deps.getRecentCommits(),
      ]);
      return {
        branches: branches.map((b) => ({ current: b.current, name: b.name })),
        recentCommits: commits.map((c) => ({
          author: c.author,
          date: c.date,
          hash: c.hash,
          message: c.message,
        })),
        staged: { available: stagedFiles.length > 0 },
      };
    },
    previewDiff: async (source: ReviewSource) => {
      let diffText: string;
      switch (source.type) {
        case "staged": {
          diffText = await deps.getStagedDiff();
          break;
        }
        case "branch": {
          diffText = await deps.getBranchDiff(source.baseRef);
          break;
        }
        case "commits": {
          diffText = await deps.getCommitDiff(source.commits);
          break;
        }
        default: {
          throw new Error(
            `Unsupported source type: ${(source as { type: string }).type}`
          );
        }
      }
      return buildPreview(diffText, source);
    },
  });

// ---------------------------------------------------------------------------
// events namespace — Phase 1 stub with in-memory subscription tracking
// ---------------------------------------------------------------------------

export const createEventsNamespace = () => {
  let subscriptionCounter = 0;

  return Object.freeze({
    listRecent: async (_filter?: {
      reviewId?: string;
      limit?: number;
    }): Promise<ReviewEvent[]> => [],
    subscribe: async (filter?: {
      eventTypes?: ReviewEventType[];
      reviewId?: string;
    }): Promise<EventSubscription> => {
      subscriptionCounter += 1;
      return {
        eventTypes: filter?.eventTypes ?? [
          "reviews.updated",
          "comments.updated",
          "todos.updated",
          "files.changed",
        ],
        id: `sub_${subscriptionCounter}`,
        reviewId: filter?.reviewId,
      };
    },
  });
};
