import { DIFF_SCOPES } from "@ringi/core/schemas/review";
import type { DiffScope } from "@ringi/core/schemas/review";
import { getDiffSummary, parseDiff } from "@ringi/core/services/diff.service";
import { GitService } from "@ringi/core/services/git.service";
import { createServerFn } from "@tanstack/react-start";
import * as Effect from "effect/Effect";

import { serverRuntime } from "../api/-lib/server-runtime";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_DIFF_SCOPE = "staged" as const satisfies DiffScope;

const isDiffScope = (value: unknown): value is DiffScope =>
  typeof value === "string" && DIFF_SCOPES.includes(value as DiffScope);

export const getDiffScope = (value: unknown): DiffScope =>
  isDiffScope(value) ? value : DEFAULT_DIFF_SCOPE;

// ---------------------------------------------------------------------------
// Server function
// ---------------------------------------------------------------------------

export const loadScopedDiff = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => {
    const data = input as Record<string, unknown> | undefined;
    return { scope: getDiffScope(data?.scope) };
  })
  .handler(({ data }) =>
    serverRuntime.runPromise(
      Effect.gen(function* loadScopedDiffEffect() {
        const git = yield* GitService;

        let diffText = "";
        switch (data.scope) {
          case "uncommitted": {
            diffText = yield* git.getUncommittedDiff;
            break;
          }
          case "unstaged": {
            diffText = yield* git.getUnstagedDiff;
            break;
          }
          case "last-commit": {
            diffText = yield* git.getLastCommitDiff;
            break;
          }
          default: {
            diffText = yield* git.getStagedDiff;
            break;
          }
        }

        const files = parseDiff(diffText);
        const summary = getDiffSummary(files);
        const repository = yield* git.getRepositoryInfo;
        return { files, repository, scope: data.scope, summary };
      })
    )
  );
