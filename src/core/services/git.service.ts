import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import * as HttpApiSchema from "@effect/platform/HttpApiSchema";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class GitError extends Schema.TaggedError<GitError>()(
  "GitError",
  { message: Schema.String },
  HttpApiSchema.annotations({ status: 500 })
) {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const execGit = (args: readonly string[], repoPath: string) =>
  Effect.tryPromise({
    catch: (error) => new GitError({ message: String(error) }),
    try: () =>
      new Promise<string>((resolve, reject) => {
        execFile(
          "git",
          [...args],
          { cwd: repoPath, maxBuffer: 50 * 1024 * 1024 },
          (err, stdout) => {
            if (err) {
              reject(err);
            } else {
              resolve(stdout);
            }
          }
        );
      }),
  });

/** Split git output into non-empty lines. */
const lines = (output: string): string[] =>
  output.trim().split("\n").filter(Boolean);

/** Parse name-status output (e.g. `M\tfile.ts`). */
const parseNameStatus = (output: string) =>
  lines(output).map((line) => {
    const [status, ...rest] = line.split("\t");
    return { path: rest.join("\t"), status: status! };
  });

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class GitService extends Effect.Service<GitService>()("GitService", {
  effect: Effect.gen(function* effect() {
    const repoPath = yield* Config.string("REPOSITORY_PATH").pipe(
      Config.withDefault(process.cwd())
    );

    // -- repo state --------------------------------------------------------

    const hasCommits = execGit(["rev-parse", "HEAD"], repoPath).pipe(
      Effect.as(true),
      Effect.catchAll(() => Effect.succeed(false))
    );

    // -- repository info --------------------------------------------------

    const getRepositoryInfo = Effect.gen(function* getRepositoryInfo() {
      const name = yield* execGit(
        ["rev-parse", "--show-toplevel"],
        repoPath
      ).pipe(Effect.map((s) => s.trim().split("/").pop() ?? "unknown"));

      const branch = yield* execGit(
        ["rev-parse", "--abbrev-ref", "HEAD"],
        repoPath
      ).pipe(Effect.map((s) => s.trim()));

      const remote = yield* execGit(
        ["config", "--get", "remote.origin.url"],
        repoPath
      ).pipe(
        Effect.map((s) => s.trim() || null),
        Effect.catchAll(() => Effect.succeed(null))
      );

      return { branch, name, path: repoPath, remote };
    });

    // -- diffs -------------------------------------------------------------

    const getStagedDiff = execGit(
      ["diff", "--cached", "--no-color", "--unified=3"],
      repoPath
    );

    const getUncommittedDiff = hasCommits.pipe(
      Effect.flatMap((hasCommits) =>
        hasCommits
          ? execGit(["diff", "HEAD", "--no-color", "--unified=3"], repoPath)
          : Effect.succeed("")
      )
    );

    const getUnstagedDiff = execGit(
      ["diff", "--no-color", "--unified=3"],
      repoPath
    );

    const getLastCommitDiff = hasCommits.pipe(
      Effect.flatMap((hasCommits) =>
        hasCommits
          ? execGit(
              ["show", "HEAD", "--format=", "--no-color", "--unified=3"],
              repoPath
            )
          : Effect.succeed("")
      )
    );

    const getBranchDiff = (branch: string) =>
      execGit(
        ["diff", `${branch}...HEAD`, "--no-color", "--unified=3"],
        repoPath
      );

    const getCommitDiff = (shas: readonly string[]) => {
      if (shas.length === 1) {
        return execGit(
          ["show", shas[0]!, "--format=", "--no-color", "--unified=3"],
          repoPath
        );
      }
      const first = shas.at(-1)!;
      const last = shas[0]!;
      return execGit(
        ["diff", `${first}~1..${last}`, "--no-color", "--unified=3"],
        repoPath
      );
    };

    // -- file lists --------------------------------------------------------

    const getStagedFiles = execGit(
      ["diff", "--cached", "--name-status"],
      repoPath
    ).pipe(Effect.map(parseNameStatus));

    const getUncommittedFiles = hasCommits.pipe(
      Effect.flatMap((hasCommits) =>
        hasCommits
          ? execGit(["diff", "HEAD", "--name-status"], repoPath).pipe(
              Effect.map(parseNameStatus)
            )
          : Effect.succeed([])
      )
    );

    const getUnstagedFiles = execGit(["diff", "--name-status"], repoPath).pipe(
      Effect.map(parseNameStatus)
    );

    const getLastCommitFiles = hasCommits.pipe(
      Effect.flatMap((hasCommits) =>
        hasCommits
          ? execGit(
              ["show", "HEAD", "--format=", "--name-status"],
              repoPath
            ).pipe(Effect.map(parseNameStatus))
          : Effect.succeed([])
      )
    );

    // -- file content ------------------------------------------------------

    const getFileContent = (
      filePath: string,
      version: "staged" | "head" | "working"
    ) =>
      Effect.gen(function* getFileContent() {
        switch (version) {
          case "staged": {
            return yield* execGit(["show", `:${filePath}`], repoPath);
          }
          case "head": {
            return yield* execGit(["show", `HEAD:${filePath}`], repoPath);
          }
          case "working":
          default: {
            return readFileSync(join(repoPath, filePath), "utf8");
          }
        }
      });

    // -- tree / branches / commits -----------------------------------------

    const getFileTree = (ref: string) =>
      execGit(["ls-tree", "-r", "--name-only", ref], repoPath).pipe(
        Effect.map(lines)
      );

    const getBranches = execGit(
      ["branch", "--format=%(refname:short)\t%(HEAD)"],
      repoPath
    ).pipe(
      Effect.map((output) =>
        lines(output).map((line) => {
          const [name, head] = line.split("\t");
          return { current: head === "*", name: name! };
        })
      )
    );

    const getCommits = (opts: {
      limit?: number;
      offset?: number;
      search?: string;
    }) =>
      Effect.gen(function* getCommits() {
        const limit = (opts.limit ?? 20) + 1; // +1 to detect hasMore
        const args = [
          "log",
          `--max-count=${limit}`,
          `--skip=${opts.offset ?? 0}`,
          "--format=%H\t%s\t%an\t%aI",
        ];
        if (opts.search) {
          args.push(`--grep=${opts.search}`, "-i");
        }

        const output = yield* execGit(args, repoPath);
        const rows = lines(output);
        const hasMore = rows.length === limit;
        const commits = (hasMore ? rows.slice(0, -1) : rows).map((line) => {
          const [hash, message, author, date] = line.split("\t");
          return {
            author: author!,
            date: date!,
            hash: hash!,
            message: message!,
          };
        });
        return { commits, hasMore };
      });

    // -- staging operations ------------------------------------------------

    const stageFiles = (files: readonly string[]) =>
      execGit(["add", "--", ...files], repoPath).pipe(Effect.as(files));

    const stageAll = execGit(["add", "-A"], repoPath).pipe(
      Effect.flatMap(() => getStagedFiles),
      Effect.map((files) => files.map((f) => f.path))
    );

    const unstageFiles = (files: readonly string[]) =>
      execGit(["reset", "HEAD", "--", ...files], repoPath).pipe(
        Effect.as(files)
      );

    const getRepositoryPath = execGit(
      ["rev-parse", "--show-toplevel"],
      repoPath
    ).pipe(Effect.map((s) => s.trim()));

    // -- public interface --------------------------------------------------

    return {
      getBranchDiff,
      getBranches,
      getCommitDiff,
      getCommits,
      getFileContent,
      getFileTree,
      getLastCommitDiff,
      getLastCommitFiles,
      getRepositoryInfo,
      getRepositoryPath,
      getStagedDiff,
      getStagedFiles,
      getUncommittedDiff,
      getUncommittedFiles,
      getUnstagedDiff,
      getUnstagedFiles,
      hasCommits,
      stageAll,
      stageFiles,
      unstageFiles,
    } as const;
  }),
}) {}
