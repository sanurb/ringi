/**
 * Pure formatting logic for review feedback export.
 *
 * Separated from presentation so it's trivially testable and
 * reusable across CLI, MCP, and UI surfaces.
 */

// ---------------------------------------------------------------------------
// Input contract — the minimal shape needed to format a comment.
// Both `Comment` (API) and `LocalComment` (session) satisfy this.
// ---------------------------------------------------------------------------

export interface ExportableComment {
  readonly filePath: string;
  readonly lineNumber: number | null;
  readonly lineType: "added" | "removed" | "context" | null;
  readonly content: string;
  readonly suggestion?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LINE_TYPE_LABELS: Record<string, string> = {
  added: "new",
  context: "context",
  removed: "old",
};

const lineTypeLabel = (type: ExportableComment["lineType"]): string =>
  (type && LINE_TYPE_LABELS[type]) ?? "context";

const groupByFile = (
  comments: readonly ExportableComment[]
): Map<string, ExportableComment[]> => {
  const groups = new Map<string, ExportableComment[]>();

  for (const comment of comments) {
    const key = comment.filePath || "(general)";
    const existing = groups.get(key);

    if (existing) {
      existing.push(comment);
    } else {
      groups.set(key, [comment]);
    }
  }

  return groups;
};

const sortByLine = (a: ExportableComment, b: ExportableComment): number =>
  (a.lineNumber ?? 0) - (b.lineNumber ?? 0);

// ---------------------------------------------------------------------------
// Main formatter
// ---------------------------------------------------------------------------

export const formatReviewFeedback = (
  comments: readonly ExportableComment[]
): string => {
  if (comments.length === 0) {
    return "";
  }

  const lines: string[] = ["# Code Review Feedback", ""];

  const groups = groupByFile(comments);
  const sortedFiles = [...groups.keys()].toSorted((a: string, b: string) =>
    a.localeCompare(b)
  );

  for (const filePath of sortedFiles) {
    const fileComments = groups.get(filePath);

    if (!fileComments || fileComments.length === 0) {
      continue;
    }

    fileComments.sort(sortByLine);

    lines.push(`## ${filePath}`, "");

    for (const comment of fileComments) {
      const lineLabel =
        comment.lineNumber === null || comment.lineNumber === undefined
          ? "General"
          : `Line ${comment.lineNumber} (${lineTypeLabel(comment.lineType)})`;

      lines.push(`### ${lineLabel}`);
      lines.push(comment.content);

      if (comment.suggestion) {
        lines.push("");
        lines.push("```suggestion");
        lines.push(comment.suggestion);
        lines.push("```");
      }

      lines.push("");
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
};
