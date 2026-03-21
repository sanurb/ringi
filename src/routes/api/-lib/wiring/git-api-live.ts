import * as HttpApiBuilder from "@effect/platform/HttpApiBuilder";
import * as Effect from "effect/Effect";

import { DomainApi } from "@/api/domain-api";

import { GitService } from "../services/git.service";

export const GitApiLive = HttpApiBuilder.group(DomainApi, "git", (handlers) =>
  handlers
    .handle("info", (_) =>
      Effect.gen(function* GitApiLive() {
        const git = yield* GitService;
        return yield* git.getRepositoryInfo;
      }).pipe(Effect.catchTags({ GitError: (e) => Effect.die(e) }))
    )
    .handle("branches", (_) =>
      Effect.gen(function* GitApiLive() {
        const git = yield* GitService;
        return yield* git.getBranches;
      }).pipe(Effect.catchTags({ GitError: (e) => Effect.die(e) }))
    )
    .handle("commits", (_) =>
      Effect.gen(function* GitApiLive() {
        const git = yield* GitService;
        return yield* git.getCommits({});
      }).pipe(Effect.catchTags({ GitError: (e) => Effect.die(e) }))
    )
    .handle("staged", (_) =>
      Effect.gen(function* GitApiLive() {
        const git = yield* GitService;
        const files = yield* git.getStagedFiles;
        return { hasStagedChanges: files.length > 0 };
      }).pipe(Effect.catchTags({ GitError: (e) => Effect.die(e) }))
    )
    .handle("stage", (_) =>
      Effect.gen(function* GitApiLive() {
        const git = yield* GitService;
        const staged = yield* git.stageFiles(_.payload.files);
        return { staged: [...staged], success: true as const };
      }).pipe(Effect.catchTags({ GitError: (e) => Effect.die(e) }))
    )
    .handle("stageAll", (_) =>
      Effect.gen(function* GitApiLive() {
        const git = yield* GitService;
        const staged = yield* git.stageAll;
        return { staged: [...staged], success: true as const };
      }).pipe(Effect.catchTags({ GitError: (e) => Effect.die(e) }))
    )
    .handle("unstage", (_) =>
      Effect.gen(function* GitApiLive() {
        const git = yield* GitService;
        const unstaged = yield* git.unstageFiles(_.payload.files);
        return { success: true as const, unstaged: [...unstaged] };
      }).pipe(Effect.catchTags({ GitError: (e) => Effect.die(e) }))
    )
);
