import { describe, expect, it } from "vitest";

import { formatAnnotationFeedback } from "./format-annotation-feedback";
import type { FileAnnotationGroup } from "./use-annotations-panel";

const makeGroup = (
  filePath: string,
  annotations: FileAnnotationGroup["annotations"]
): FileAnnotationGroup => ({ annotations, filePath });

const makeEntry = (
  overrides: Partial<FileAnnotationGroup["annotations"][0]> = {}
) => ({
  content: "fix this",
  createdAt: "2024-01-01T00:00:00Z",
  filePath: "src/index.ts",
  id: "local-1",
  lineNumber: 10,
  lineType: "added" as const,
  suggestion: null,
  ...overrides,
});

describe("formatAnnotationFeedback", () => {
  it("returns empty string for no groups", () => {
    expect(formatAnnotationFeedback([])).toBe("");
  });

  it("returns empty string for groups with no annotations", () => {
    expect(formatAnnotationFeedback([makeGroup("a.ts", [])])).toBe("");
  });

  it("formats a single annotation with correct markdown", () => {
    const result = formatAnnotationFeedback([
      makeGroup("docs/CLI.md", [
        makeEntry({ content: "test", filePath: "docs/CLI.md", lineNumber: 31 }),
      ]),
    ]);

    expect(result).toBe(
      [
        "# Code Review Feedback",
        "",
        "## docs/CLI.md",
        "",
        "### Line 31 (new)",
        "test",
        "",
      ].join("\n")
    );
  });

  it("produces the exact expected multi-file output shape", () => {
    const result = formatAnnotationFeedback([
      makeGroup("docs/CLI.md", [
        makeEntry({ content: "test", filePath: "docs/CLI.md", lineNumber: 31 }),
        makeEntry({
          content: "fix this",
          filePath: "docs/CLI.md",
          lineNumber: 1057,
        }),
      ]),
      makeGroup("package.json", [
        makeEntry({
          content: "add the port",
          filePath: "package.json",
          lineNumber: 9,
        }),
      ]),
    ]);

    expect(result).toBe(
      [
        "# Code Review Feedback",
        "",
        "## docs/CLI.md",
        "",
        "### Line 31 (new)",
        "test",
        "",
        "### Line 1057 (new)",
        "fix this",
        "",
        "## package.json",
        "",
        "### Line 9 (new)",
        "add the port",
        "",
      ].join("\n")
    );
  });

  it("labels removed lines as (old)", () => {
    const result = formatAnnotationFeedback([
      makeGroup("a.ts", [makeEntry({ lineNumber: 5, lineType: "removed" })]),
    ]);

    expect(result).toContain("### Line 5 (old)");
  });

  it("includes suggestion blocks", () => {
    const result = formatAnnotationFeedback([
      makeGroup("a.ts", [
        makeEntry({ content: "use const", suggestion: "const x = 1;" }),
      ]),
    ]);

    expect(result).toContain("```suggestion");
    expect(result).toContain("const x = 1;");
  });

  it("sorts files alphabetically", () => {
    const result = formatAnnotationFeedback([
      makeGroup("z.ts", [makeEntry({ filePath: "z.ts" })]),
      makeGroup("a.ts", [makeEntry({ filePath: "a.ts" })]),
    ]);

    const headings = [...result.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(headings).toEqual(["a.ts", "z.ts"]);
  });
});
