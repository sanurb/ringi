import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
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

/** Max bytes to collect from a git command before truncating (200 MB). */
const MAX_STDOUT_BYTES = 200 * 1024 * 1024;

const execGit = (args: readonly string[], repoPath: string) =>
  Effect.tryPromise({
    catch: (error) => new GitError({ message: String(error) }),
    try: () =>
      new Promise<string>((resolve, reject) => {
        const child = spawn("git", [...args], { cwd: repoPath });

        const chunks: Buffer[] = [];
        let bytes = 0;
        let truncated = false;

        child.stdout.on("data", (chunk: Buffer) => {
          if (truncated) {
            return;
          }
          bytes += chunk.length;
          if (bytes > MAX_STDOUT_BYTES) {
            truncated = true;
            child.kill();
            return;
          }
          chunks.push(chunk);
        });

        let stderr = "";
        child.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString();
        });

        child.on("error", reject);

        child.on("close", (code) => {
          if (truncated) {
            resolve(Buffer.concat(chunks).toString("utf8"));
            return;
          }
          if (code !== 0) {
            reject(
              new Error(`git ${args[0]} exited with code ${code}: ${stderr}`)
            );
          } else {
            resolve(Buffer.concat(chunks).toString("utf8"));
          }
        });
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

export class GitService extends Effect.Service<GitService>()(
  "@ringi/GitService",
  {
    effect: Effect.gen(function* effect() {
      const repoPath = yield* Config.string("REPOSITORY_PATH").pipe(
        Config.withDefault(process.cwd())
      );

      // -- repo state --------------------------------------------------------

      const hasCommits = execGit(["rev-parse", "HEAD"], repoPath).pipe(
        Effect.as(true),
        Effect.catchTag("GitError", () => Effect.succeed(false)),
        Effect.withSpan("GitService.hasCommits")
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
          Effect.catchTag("GitError", () => Effect.succeed(null))
        );

        return { branch, name, path: repoPath, remote };
      }).pipe(Effect.withSpan("GitService.getRepositoryInfo"));

      // -- diffs -------------------------------------------------------------

      const getStagedDiff = execGit(
        ["diff", "--cached", "--no-color", "--unified=3"],
        repoPath
      ).pipe(Effect.withSpan("GitService.getStagedDiff"));

      const getUncommittedDiff = hasCommits.pipe(
        Effect.flatMap((has) =>
          has
            ? execGit(["diff", "HEAD", "--no-color", "--unified=3"], repoPath)
            : Effect.succeed("")
        ),
        Effect.withSpan("GitService.getUncommittedDiff")
      );

      const getUnstagedDiff = execGit(
        ["diff", "--no-color", "--unified=3"],
        repoPath
      ).pipe(Effect.withSpan("GitService.getUnstagedDiff"));

      const getLastCommitDiff = hasCommits.pipe(
        Effect.flatMap((has) =>
          has
            ? execGit(
                ["show", "HEAD", "--format=", "--no-color", "--unified=3"],
                repoPath
              )
            : Effect.succeed("")
        ),
        Effect.withSpan("GitService.getLastCommitDiff")
      );

      const getBranchDiff = Effect.fn("GitService.getBranchDiff")(
        function* getBranchDiff(branch: string) {
          return yield* execGit(
            ["diff", `${branch}...HEAD`, "--no-color", "--unified=3"],
            repoPath
          );
        }
      );

      const getCommitDiff = Effect.fn("GitService.getCommitDiff")(
        function* getCommitDiff(shas: readonly string[]) {
          if (shas.length === 1) {
            return yield* execGit(
              ["show", shas[0]!, "--format=", "--no-color", "--unified=3"],
              repoPath
            );
          }
          const first = shas.at(-1)!;
          const last = shas[0]!;
          return yield* execGit(
            ["diff", `${first}~1..${last}`, "--no-color", "--unified=3"],
            repoPath
          );
        }
      );

      // -- file lists --------------------------------------------------------

      const getStagedFiles = execGit(
        ["diff", "--cached", "--name-status"],
        repoPath
      ).pipe(
        Effect.map(parseNameStatus),
        Effect.withSpan("GitService.getStagedFiles")
      );

      const getUncommittedFiles = hasCommits.pipe(
        Effect.flatMap((has) =>
          has
            ? execGit(["diff", "HEAD", "--name-status"], repoPath).pipe(
                Effect.map(parseNameStatus)
              )
            : Effect.succeed([])
        ),
        Effect.withSpan("GitService.getUncommittedFiles")
      );

      const getUnstagedFiles = execGit(
        ["diff", "--name-status"],
        repoPath
      ).pipe(
        Effect.map(parseNameStatus),
        Effect.withSpan("GitService.getUnstagedFiles")
      );

      const getLastCommitFiles = hasCommits.pipe(
        Effect.flatMap((has) =>
          has
            ? execGit(
                ["show", "HEAD", "--format=", "--name-status"],
                repoPath
              ).pipe(Effect.map(parseNameStatus))
            : Effect.succeed([])
        ),
        Effect.withSpan("GitService.getLastCommitFiles")
      );

      // -- file content ------------------------------------------------------

      const getFileContent = Effect.fn("GitService.getFileContent")(
        function* getFileContent(
          filePath: string,
          version: "staged" | "head" | "working"
        ) {
          switch (version) {
            case "staged": {
              return yield* execGit(["show", `:${filePath}`], repoPath);
            }
            case "head": {
              return yield* execGit(["show", `HEAD:${filePath}`], repoPath);
            }
            case "working":
            default: {
              return yield* Effect.tryPromise({
                catch: (error) =>
                  new GitError({
                    message: `Failed to read ${filePath}: ${String(error)}`,
                  }),
                try: () => readFile(join(repoPath, filePath), "utf8"),
              });
            }
          }
        }
      );

      // -- tree / branches / commits -----------------------------------------

      const getFileTree = Effect.fn("GitService.getFileTree")(
        function* getFileTree(ref: string) {
          return yield* execGit(
            ["ls-tree", "-r", "--name-only", ref],
            repoPath
          ).pipe(Effect.map(lines));
        }
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
        ),
        Effect.withSpan("GitService.getBranches")
      );

      const getCommits = Effect.fn("GitService.getCommits")(
        function* getCommits(opts: {
          limit?: number;
          offset?: number;
          search?: string;
        }) {
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
        }
      );

      // -- staging operations ------------------------------------------------

      const stageFiles = Effect.fn("GitService.stageFiles")(
        function* stageFiles(files: readonly string[]) {
          return yield* execGit(["add", "--", ...files], repoPath).pipe(
            Effect.as(files)
          );
        }
      );

      const stageAll = execGit(["add", "-A"], repoPath).pipe(
        Effect.flatMap(() => getStagedFiles),
        Effect.map((files) => files.map((f) => f.path)),
        Effect.withSpan("GitService.stageAll")
      );

      const unstageFiles = Effect.fn("GitService.unstageFiles")(
        function* unstageFiles(files: readonly string[]) {
          return yield* execGit(
            ["reset", "HEAD", "--", ...files],
            repoPath
          ).pipe(Effect.as(files));
        }
      );

      const getRepositoryPath = execGit(
        ["rev-parse", "--show-toplevel"],
        repoPath
      ).pipe(
        Effect.map((s) => s.trim()),
        Effect.withSpan("GitService.getRepositoryPath")
      );

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
  }
) {}
