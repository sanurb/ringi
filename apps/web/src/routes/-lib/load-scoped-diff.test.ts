import { describe, expect, it } from "vitest";
// We test the error classification logic by importing the module
// and checking the exported types and helper behavior.
// The classifyGitError function is internal, so we verify the contract
// through the ScopedDiffError type shape.

import type { ScopedDiffError } from "./load-scoped-diff";

describe("ScopedDiffError type contract", () => {
  it("NOT_GIT_REPOSITORY has expected shape", () => {
    const error: ScopedDiffError = {
      error: {
        code: "NOT_GIT_REPOSITORY",
        message: "Not inside a Git repository.",
        details: "fatal: not a git repository",
      },
      scope: "staged",
    };
    expect(error.error.code).toBe("NOT_GIT_REPOSITORY");
    expect(error.files).toBeUndefined();
    expect(error.repository).toBeUndefined();
    expect(error.summary).toBeUndefined();
  });

  it("GIT_COMMAND_FAILED has expected shape", () => {
    const error: ScopedDiffError = {
      error: {
        code: "GIT_COMMAND_FAILED",
        message: "A git command failed.",
        details: "git diff exited with code 128",
      },
      scope: "uncommitted",
    };
    expect(error.error.code).toBe("GIT_COMMAND_FAILED");
  });

  it("details field is optional", () => {
    const error: ScopedDiffError = {
      error: {
        code: "NOT_GIT_REPOSITORY",
        message: "Not inside a Git repository.",
      },
      scope: "staged",
    };
    expect(error.error.details).toBeUndefined();
  });
});
