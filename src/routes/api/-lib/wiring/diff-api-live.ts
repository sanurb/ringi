import * as HttpApiBuilder from "@effect/platform/HttpApiBuilder";
import * as Effect from "effect/Effect";

import { DomainApi } from "@/api/domain-api";

import { parseDiff, getDiffSummary } from "../services/diff.service";
import { GitService } from "../services/git.service";
import { ReviewService } from "../services/review.service";

export const DiffApiLive = HttpApiBuilder.group(DomainApi, "diff", (handlers) =>
  handlers
    .handle("staged", (_) =>
      Effect.gen(function* DiffApiLive() {
        const git = yield* GitService;
        const diffText = yield* git.getStagedDiff;
        const files = parseDiff(diffText);
        const summary = getDiffSummary(files);
        const repository = yield* git.getRepositoryInfo;
        return { files, repository, summary };
      }).pipe(Effect.catchTags({ GitError: (e) => Effect.die(e) }))
    )
    .handle("unstaged", (_) =>
      Effect.gen(function* DiffApiLive() {
        const git = yield* GitService;
        const diffText = yield* git.getUnstagedDiff;
        const files = parseDiff(diffText);
        const summary = getDiffSummary(files);
        const repository = yield* git.getRepositoryInfo;
        return { files, repository, summary };
      }).pipe(Effect.catchTags({ GitError: (e) => Effect.die(e) }))
    )
    .handle("files", (_) =>
      Effect.gen(function* DiffApiLive() {
        const git = yield* GitService;
        const stagedFiles = yield* git.getStagedFiles;
        return {
          files: stagedFiles,
          hasStagedChanges: stagedFiles.length > 0,
        };
      }).pipe(Effect.catchTags({ GitError: (e) => Effect.die(e) }))
    )
);

export const ReviewFilesApiLive = HttpApiBuilder.group(
  DomainApi,
  "reviewFiles",
  (handlers) =>
    handlers.handle("hunks", (_) =>
      Effect.gen(function* ReviewFilesApiLive() {
        const svc = yield* ReviewService;
        const hunks = yield* svc.getFileHunks(
          _.path.reviewId,
          _.urlParams.path
        );
        return { hunks };
      }).pipe(Effect.catchTags({ GitError: (e) => Effect.die(e) }))
    )
);
