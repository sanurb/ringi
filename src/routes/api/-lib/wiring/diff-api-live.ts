import * as HttpApiBuilder from "@effect/platform/HttpApiBuilder";
import * as Effect from "effect/Effect";

import { DomainApi } from "@/api/domain-api";
import type { DiffScope } from "@/api/schemas/review";
import { getDiffSummary, parseDiff } from "@/core/services/diff.service";
import { GitService } from "@/core/services/git.service";
import { ReviewService } from "@/core/services/review.service";

const loadScopedDiff = (scope: DiffScope) =>
  Effect.gen(function* loadScopedDiffEffect() {
    const git = yield* GitService;

    let diffText = "";
    switch (scope) {
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
    return { files, repository, summary };
  });

export const DiffApiLive = HttpApiBuilder.group(DomainApi, "diff", (handlers) =>
  handlers
    .handle("staged", (_) =>
      loadScopedDiff("staged").pipe(
        Effect.catchTags({ GitError: (error) => Effect.die(error) })
      )
    )
    .handle("unstaged", (_) =>
      loadScopedDiff("unstaged").pipe(
        Effect.catchTags({ GitError: (error) => Effect.die(error) })
      )
    )
    .handle("scoped", (_) =>
      loadScopedDiff(_.urlParams.scope).pipe(
        Effect.catchTags({ GitError: (error) => Effect.die(error) })
      )
    )
    .handle("files", (_) =>
      Effect.gen(function* loadDiffFiles() {
        const git = yield* GitService;
        const stagedFiles = yield* git.getStagedFiles;
        return {
          files: stagedFiles,
          hasStagedChanges: stagedFiles.length > 0,
        };
      }).pipe(Effect.catchTags({ GitError: (error) => Effect.die(error) }))
    )
);

export const ReviewFilesApiLive = HttpApiBuilder.group(
  DomainApi,
  "reviewFiles",
  (handlers) =>
    handlers.handle("hunks", (_) =>
      Effect.gen(function* loadReviewFileHunks() {
        const svc = yield* ReviewService;
        const hunks = yield* svc.getFileHunks(
          _.path.reviewId,
          _.urlParams.path
        );
        return { hunks };
      }).pipe(Effect.catchTags({ GitError: (error) => Effect.die(error) }))
    )
);
