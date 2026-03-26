import type { DiffFile } from "@ringi/core/schemas/diff";
import { describe, expect, it } from "vitest";

import { toPatchString, toPierreFileContents } from "./pierre-adapter";

function makeDiffFile(overrides: Partial<DiffFile> = {}): DiffFile {
  return {
    additions: 2,
    deletions: 2,
    hunks: [
      {
        lines: [
          {
            content: "const a = 1;",
            newLineNumber: 1,
            oldLineNumber: 1,
            type: "context",
          },
          {
            content: "const b = 2;",
            newLineNumber: null,
            oldLineNumber: 2,
            type: "removed",
          },
          {
            content: "const c = 3;",
            newLineNumber: null,
            oldLineNumber: 3,
            type: "removed",
          },
          {
            content: "const b = 20;",
            newLineNumber: 2,
            oldLineNumber: null,
            type: "added",
          },
          {
            content: "return a + b;",
            newLineNumber: 3,
            oldLineNumber: 4,
            type: "context",
          },
          {
            content: "console.log(b);",
            newLineNumber: 4,
            oldLineNumber: null,
            type: "added",
          },
        ],
        newLines: 4,
        newStart: 1,
        oldLines: 4,
        oldStart: 1,
      },
    ],
    newPath: "src/example.ts",
    oldPath: "src/example.ts",
    status: "modified",
    ...overrides,
  };
}

describe("toPatchString", () => {
  it("produces a valid unified diff patch from ringi DiffFile", () => {
    const patch = toPatchString(makeDiffFile());

    expect(patch).toBe(
      [
        "--- a/src/example.ts",
        "+++ b/src/example.ts",
        "@@ -1,4 +1,4 @@",
        " const a = 1;",
        "-const b = 2;",
        "-const c = 3;",
        "+const b = 20;",
        " return a + b;",
        "+console.log(b);",
      ].join("\n")
    );
  });

  it("handles renamed files with correct paths", () => {
    const patch = toPatchString(
      makeDiffFile({
        newPath: "src/new.ts",
        oldPath: "src/old.ts",
        status: "renamed",
      })
    );

    expect(patch).toContain("--- a/src/old.ts");
    expect(patch).toContain("+++ b/src/new.ts");
  });

  it("handles empty hunks (binary/mode-change)", () => {
    const patch = toPatchString(
      makeDiffFile({ additions: 0, deletions: 0, hunks: [] })
    );

    expect(patch).toBe("--- a/src/example.ts\n+++ b/src/example.ts");
  });
});

describe("toPierreFileContents", () => {
  it("joins lines into file contents without adding an extra trailing newline", () => {
    const result = toPierreFileContents("src/example.ts", ["one", "two"]);

    expect(result).toEqual({
      contents: "one\ntwo",
      name: "src/example.ts",
    });
  });
});
