import { describe, expect, it } from "vitest";

import type { ExportableComment } from "./format-review-feedback";
import { formatReviewFeedback } from "./format-review-feedback";

const makeComment = (
  overrides: Partial<ExportableComment> = {}
): ExportableComment => ({
  content: "fix this",
  filePath: "src/index.ts",
  lineNumber: 10,
  lineType: "added",
  suggestion: null,
  ...overrides,
});

describe("formatReviewFeedback", () => {
  it("returns empty string for no comments", () => {
    expect(formatReviewFeedback([])).toBe("");
  });

  it("formats a single comment with correct markdown structure", () => {
    const result = formatReviewFeedback([makeComment()]);

    expect(result).toBe(
      [
        "# Code Review Feedback",
        "",
        "## src/index.ts",
        "",
        "### Line 10 (new)",
        "fix this",
        "",
      ].join("\n")
    );
  });

  it("labels added lines as (new) and removed lines as (old)", () => {
    const result = formatReviewFeedback([
      makeComment({ lineNumber: 5, lineType: "removed" }),
      makeComment({ lineNumber: 12, lineType: "added" }),
    ]);

    expect(result).toContain("### Line 5 (old)");
    expect(result).toContain("### Line 12 (new)");
  });

  it("labels context and null lineType as (context)", () => {
    const result = formatReviewFeedback([
      makeComment({ lineType: "context" }),
      makeComment({
        filePath: "b.ts",
        lineNumber: 1,
        lineType: null,
      }),
    ]);

    expect(result).toContain("(context)");
    expect(result).not.toContain("(null)");
  });

  it("uses General heading when lineNumber is null", () => {
    const result = formatReviewFeedback([makeComment({ lineNumber: null })]);

    expect(result).toContain("### General");
  });

  it("groups comments by file and sorts files alphabetically", () => {
    const result = formatReviewFeedback([
      makeComment({ filePath: "z.ts" }),
      makeComment({ filePath: "a.ts" }),
      makeComment({ filePath: "m.ts" }),
    ]);

    const fileHeadings = [...result.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(fileHeadings).toEqual(["a.ts", "m.ts", "z.ts"]);
  });

  it("sorts comments within a file by line number", () => {
    const result = formatReviewFeedback([
      makeComment({ lineNumber: 42 }),
      makeComment({ lineNumber: 3 }),
      makeComment({ lineNumber: 17 }),
    ]);

    const lineHeadings = [...result.matchAll(/### Line (\d+)/g)].map((m) =>
      Number(m[1])
    );
    expect(lineHeadings).toEqual([3, 17, 42]);
  });

  it("includes suggestion blocks when present", () => {
    const result = formatReviewFeedback([
      makeComment({
        content: "use const",
        suggestion: 'const x = "hello";',
      }),
    ]);

    expect(result).toContain("```suggestion");
    expect(result).toContain('const x = "hello";');
    expect(result).toMatch(/```suggestion\n.*\n```/s);
  });

  it("omits suggestion block when suggestion is null", () => {
    const result = formatReviewFeedback([makeComment({ suggestion: null })]);

    expect(result).not.toContain("```suggestion");
  });

  it("handles multiple comments on the same file", () => {
    const result = formatReviewFeedback([
      makeComment({ content: "first", lineNumber: 1 }),
      makeComment({ content: "second", lineNumber: 5 }),
    ]);

    // Only one file heading
    const fileHeadings = [...result.matchAll(/^## /gm)];
    expect(fileHeadings).toHaveLength(1);

    expect(result).toContain("first");
    expect(result).toContain("second");
  });

  it("uses (general) bucket for empty filePath", () => {
    const result = formatReviewFeedback([makeComment({ filePath: "" })]);

    expect(result).toContain("## (general)");
  });

  it("ends with a trailing newline", () => {
    const result = formatReviewFeedback([makeComment()]);
    expect(result.endsWith("\n")).toBe(true);
  });
});
