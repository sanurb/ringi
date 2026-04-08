/**
 * MCP sandbox global construction.
 *
 * Creates the six spec-compliant namespaces (`reviews`, `todos`, `sources`,
 * `intelligence`, `events`, `session`) from injected dependencies.
 *
 * All domain interaction goes through the `call` callback so the sandbox module
 * stays testable without an Effect runtime.
 */

import {
  createEventsNamespace,
  createIntelligenceNamespace,
  createSessionNamespace,
  createSourcesNamespace,
} from "@/mcp/namespaces";

// ---------------------------------------------------------------------------
// Dependency contract
// ---------------------------------------------------------------------------

export interface SandboxDeps {
  readonly readonly: boolean;
  readonly repoRoot: string;

  /** Run a named domain operation, recording it in the journal. */
  call: <T>(name: string, fn: () => Promise<T>) => Promise<T>;

  /** Throws if the server is in readonly mode. */
  requireWritable: () => void;

  // -- Git-backed deps for sources/session --
  getRepositoryInfo: () => Promise<{
    name: string;
    path: string;
    branch: string;
    remote: string | null;
  }>;
  getLatestReviewId: () => Promise<string | null>;
  getStagedFiles: () => Promise<readonly { path: string; status: string }[]>;
  getBranches: () => Promise<readonly { name: string; current: boolean }[]>;
  getRecentCommits: () => Promise<
    readonly { hash: string; author: string; date: string; message: string }[]
  >;
  getStagedDiff: () => Promise<string>;
  getBranchDiff: (branch: string) => Promise<string>;
  getCommitDiff: (shas: string[]) => Promise<string>;
}

// ---------------------------------------------------------------------------
// Namespace types (public for test assertions)
// ---------------------------------------------------------------------------

export interface SandboxGlobals {
  readonly reviews: ReviewsNamespace;
  readonly todos: TodosNamespace;
  readonly sources: ReturnType<typeof createSourcesNamespace>;
  readonly intelligence: ReturnType<typeof createIntelligenceNamespace>;
  readonly events: ReturnType<typeof createEventsNamespace>;
  readonly session: ReturnType<typeof createSessionNamespace>;
}

interface ReviewsNamespace {
  list: (filters?: unknown) => Promise<unknown>;
  get: (reviewId: unknown) => Promise<unknown>;
  create: (input: unknown) => Promise<unknown>;
  getFiles: (reviewId: unknown) => Promise<unknown>;
  getDiff: (query: unknown) => Promise<unknown>;
  getComments: (reviewId: unknown, filePath?: unknown) => Promise<unknown>;
  getSuggestions: (reviewId: unknown) => Promise<unknown>;
  getStatus: (reviewId: unknown) => Promise<unknown>;
  export: (options: unknown) => Promise<unknown>;
  buildContext: (options: unknown) => Promise<unknown>;
}

interface TodosNamespace {
  list: (filter?: unknown) => Promise<unknown>;
  add: (input: unknown) => Promise<unknown>;
  done: (todoId: unknown) => Promise<unknown>;
  undone: (todoId: unknown) => Promise<unknown>;
  move: (todoId: unknown, position: unknown) => Promise<unknown>;
  remove: (todoId: unknown) => Promise<unknown>;
  clear: (reviewId?: unknown) => Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const parseId = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid ${fieldName}: expected a non-empty string`);
  }
  return value;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build the six frozen namespace objects for sandbox injection.
 *
 * The `call` callback wraps every domain operation with journal tracking and
 * error handling. This keeps the sandbox module free of Effect imports.
 */
export const createSandboxGlobals = (deps: SandboxDeps): SandboxGlobals => {
  // -- reviews namespace (spec: reviews.*) ----------------------------------
  const reviews: ReviewsNamespace = Object.freeze({
    create: async (_input: unknown) => {
      deps.requireWritable();
      return deps.call("reviews.create", async () => {
        throw new Error("reviews.create: not wired to runtime");
      });
    },
    buildContext: (_options: unknown) =>
      deps.call("reviews.buildContext", async () => {
        throw new Error("reviews.buildContext: not wired to runtime");
      }),
    export: (_options: unknown) =>
      deps.call("reviews.export", async () => {
        throw new Error("reviews.export: not wired to runtime");
      }),
    get: (reviewIdValue: unknown) => {
      parseId(reviewIdValue, "reviewId");
      return deps.call("reviews.get", async () => {
        throw new Error("reviews.get: not wired to runtime");
      });
    },
    getComments: (reviewIdValue: unknown, _filePath?: unknown) => {
      parseId(reviewIdValue, "reviewId");
      return deps.call("reviews.getComments", async () => {
        throw new Error("reviews.getComments: not wired to runtime");
      });
    },
    getDiff: (_query: unknown) =>
      deps.call("reviews.getDiff", async () => {
        throw new Error("reviews.getDiff: not wired to runtime");
      }),
    getFiles: (reviewIdValue: unknown) => {
      parseId(reviewIdValue, "reviewId");
      return deps.call("reviews.getFiles", async () => {
        throw new Error("reviews.getFiles: not wired to runtime");
      });
    },
    getStatus: (reviewIdValue: unknown) => {
      parseId(reviewIdValue, "reviewId");
      return deps.call("reviews.getStatus", async () => {
        throw new Error("reviews.getStatus: not wired to runtime");
      });
    },
    getSuggestions: (reviewIdValue: unknown) => {
      parseId(reviewIdValue, "reviewId");
      return deps.call("reviews.getSuggestions", async () => {
        throw new Error("reviews.getSuggestions: not wired to runtime");
      });
    },
    list: (_filters?: unknown) =>
      deps.call("reviews.list", async () => {
        throw new Error("reviews.list: not wired to runtime");
      }),
  });

  // -- todos namespace (spec: todos.*) --------------------------------------
  const todos: TodosNamespace = Object.freeze({
    add: async (_input: unknown) => {
      deps.requireWritable();
      return deps.call("todos.add", async () => {
        throw new Error("todos.add: not wired to runtime");
      });
    },
    clear: async (_reviewIdValue?: unknown) => {
      deps.requireWritable();
      return deps.call("todos.clear", async () => {
        throw new Error("todos.clear: not wired to runtime");
      });
    },
    done: async (todoIdValue: unknown) => {
      deps.requireWritable();
      parseId(todoIdValue, "todoId");
      return deps.call("todos.done", async () => {
        throw new Error("todos.done: not wired to runtime");
      });
    },
    list: (_filter?: unknown) =>
      deps.call("todos.list", async () => {
        throw new Error("todos.list: not wired to runtime");
      }),
    move: async (todoIdValue: unknown, _positionValue: unknown) => {
      deps.requireWritable();
      parseId(todoIdValue, "todoId");
      return deps.call("todos.move", async () => {
        throw new Error("todos.move: not wired to runtime");
      });
    },
    remove: async (todoIdValue: unknown) => {
      deps.requireWritable();
      parseId(todoIdValue, "todoId");
      return deps.call("todos.remove", async () => {
        throw new Error("todos.remove: not wired to runtime");
      });
    },
    undone: async (todoIdValue: unknown) => {
      deps.requireWritable();
      parseId(todoIdValue, "todoId");
      return deps.call("todos.undone", async () => {
        throw new Error("todos.undone: not wired to runtime");
      });
    },
  });

  // -- Remaining namespaces use dedicated factories -------------------------
  const sources = createSourcesNamespace({
    getBranchDiff: deps.getBranchDiff,
    getBranches: deps.getBranches,
    getCommitDiff: deps.getCommitDiff,
    getRecentCommits: deps.getRecentCommits,
    getRepositoryInfo: deps.getRepositoryInfo,
    getStagedDiff: deps.getStagedDiff,
    getStagedFiles: deps.getStagedFiles,
  });

  const intelligence = createIntelligenceNamespace();

  const events = createEventsNamespace();

  const session = createSessionNamespace({
    getLatestReviewId: deps.getLatestReviewId,
    getRepositoryInfo: deps.getRepositoryInfo,
    readonly: deps.readonly,
  });

  return { events, intelligence, reviews, session, sources, todos };
};
