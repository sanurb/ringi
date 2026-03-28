import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CliFailure, ExitCode } from "@/cli/cli-errors";
import { resolveCliConfig } from "@/cli/runtime";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeGitRepo = (): string => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "ringi-test-")));
  execFileSync("git", ["init", "--initial-branch=main"], {
    cwd: dir,
    stdio: "ignore",
  });
  execFileSync("git", ["config", "user.email", "test@test.com"], {
    cwd: dir,
    stdio: "ignore",
  });
  execFileSync("git", ["config", "user.name", "Test"], {
    cwd: dir,
    stdio: "ignore",
  });
  return dir;
};

const makeNonGitDir = (): string =>
  realpathSync(mkdtempSync(join(tmpdir(), "ringi-no-git-")));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resolveCliConfig", () => {
  it("succeeds for a valid Git repository", () => {
    const repo = makeGitRepo();
    try {
      const result = resolveCliConfig({
        color: true,
        quiet: false,
        repo,
        verbose: false,
      });
      expect(result).not.toBeInstanceOf(CliFailure);
      expect((result as Exclude<typeof result, CliFailure>).repoRoot).toBe(
        repo
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("returns CliFailure for a non-Git directory", () => {
    const dir = makeNonGitDir();
    try {
      const result = resolveCliConfig({
        color: true,
        quiet: false,
        repo: dir,
        verbose: false,
      });
      expect(result).toBeInstanceOf(CliFailure);
      const failure = result as CliFailure;
      expect(failure.exitCode).toBe(ExitCode.StateUnavailable);
      expect(failure.message).toContain("not a Git repository");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns CliFailure with --repo pointing to non-existent path", () => {
    const result = resolveCliConfig({
      color: true,
      quiet: false,
      repo: "/tmp/ringi-does-not-exist-ever",
      verbose: false,
    });
    expect(result).toBeInstanceOf(CliFailure);
    const failure = result as CliFailure;
    expect(failure.exitCode).toBe(ExitCode.StateUnavailable);
  });

  it("resolves dbPath relative to repo root", () => {
    const repo = makeGitRepo();
    try {
      const result = resolveCliConfig({
        color: true,
        quiet: false,
        repo,
        verbose: false,
      });
      expect(result).not.toBeInstanceOf(CliFailure);
      const config = result as Exclude<typeof result, CliFailure>;
      expect(config.dbPath).toBe(join(repo, ".ringi/reviews.db"));
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
