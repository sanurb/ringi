import { describe, expect, it } from "vitest";

import { deriveHunkId, parseHunkId } from "@ringi/core/schemas/diff";

// ---------------------------------------------------------------------------
// deriveHunkId — determinism and format
// ---------------------------------------------------------------------------

describe("deriveHunkId", () => {
  it("produces the canonical format", () => {
    expect(deriveHunkId("src/auth.ts", 10, 5, 12, 7)).toBe(
      "src/auth.ts:@-10,5+12,7",
    );
  });

  it("is deterministic — same input always yields same output", () => {
    const a = deriveHunkId("src/index.ts", 1, 0, 1, 3);
    const b = deriveHunkId("src/index.ts", 1, 0, 1, 3);
    expect(a).toBe(b);
  });

  it("produces different IDs for different hunks in the same file", () => {
    const a = deriveHunkId("src/app.ts", 1, 5, 1, 5);
    const b = deriveHunkId("src/app.ts", 20, 3, 22, 5);
    expect(a).not.toBe(b);
  });

  it("produces different IDs for same position in different files", () => {
    const a = deriveHunkId("src/a.ts", 1, 1, 1, 1);
    const b = deriveHunkId("src/b.ts", 1, 1, 1, 1);
    expect(a).not.toBe(b);
  });

  it("handles zero-line hunks (pure addition at file start)", () => {
    const id = deriveHunkId("new-file.ts", 0, 0, 1, 10);
    expect(id).toBe("new-file.ts:@-0,0+1,10");
  });

  it("handles paths with colons", () => {
    const id = deriveHunkId("C:/Users/dev/file.ts", 1, 2, 1, 3);
    expect(id).toBe("C:/Users/dev/file.ts:@-1,2+1,3");
  });

  it("handles paths with spaces", () => {
    const id = deriveHunkId("src/my file.ts", 5, 3, 5, 4);
    expect(id).toBe("src/my file.ts:@-5,3+5,4");
  });

  it("handles renamed files (old path used for old side)", () => {
    // For renamed files, the filePath is the new path per convention.
    const id = deriveHunkId("src/new-name.ts", 10, 5, 10, 7);
    expect(id).toBe("src/new-name.ts:@-10,5+10,7");
  });
});

// ---------------------------------------------------------------------------
// parseHunkId — inverse of deriveHunkId
// ---------------------------------------------------------------------------

describe("parseHunkId", () => {
  it("round-trips with deriveHunkId", () => {
    const id = deriveHunkId("src/auth.ts", 10, 5, 12, 7);
    const parsed = parseHunkId(id);
    expect(parsed).toEqual({
      filePath: "src/auth.ts",
      newLines: 7,
      newStart: 12,
      oldLines: 5,
      oldStart: 10,
    });
  });

  it("round-trips zero-line hunks", () => {
    const id = deriveHunkId("new.ts", 0, 0, 1, 10);
    expect(parseHunkId(id)).toEqual({
      filePath: "new.ts",
      newLines: 10,
      newStart: 1,
      oldLines: 0,
      oldStart: 0,
    });
  });

  it("round-trips paths with colons", () => {
    const id = deriveHunkId("C:/Users/dev/file.ts", 1, 2, 1, 3);
    const parsed = parseHunkId(id);
    expect(parsed).not.toBeNull();
    expect(parsed!.filePath).toBe("C:/Users/dev/file.ts");
  });

  it("returns null for invalid input", () => {
    expect(parseHunkId("")).toBeNull();
    expect(parseHunkId("not-a-hunk-id")).toBeNull();
    expect(parseHunkId("src/file.ts")).toBeNull();
  });

  it("returns null for malformed format", () => {
    expect(parseHunkId("src/file.ts:@-abc,1+1,1")).toBeNull();
    expect(parseHunkId("src/file.ts:@-1,1+1")).toBeNull();
  });
});
