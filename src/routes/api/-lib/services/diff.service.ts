import type { DiffFile, DiffHunk, DiffLine, DiffSummary } from "@/api/schemas/diff";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const HUNK_HEADER = /@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

const splitIntoFiles = (diffText: string): ReadonlyArray<string> => {
  const files: Array<string> = [];
  const lines = diffText.split("\n");
  let current: Array<string> = [];
  for (const line of lines) {
    if (line.startsWith("diff --git")) {
      if (current.length > 0) files.push(current.join("\n"));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) files.push(current.join("\n"));
  return files;
};

const parseHunks = (lines: ReadonlyArray<string>): ReadonlyArray<DiffHunk> => {
  const hunks: Array<DiffHunk> = [];
  let currentHunk: {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: Array<DiffLine>;
  } | null = null;
  let oldLineNum = 0;
  let newLineNum = 0;

  for (const line of lines) {
    const match = line.match(HUNK_HEADER);
    if (match) {
      if (currentHunk) hunks.push(currentHunk);
      const oldStart = parseInt(match[1]!, 10);
      const oldLines = parseInt(match[2] ?? "1", 10);
      const newStart = parseInt(match[3]!, 10);
      const newLines = parseInt(match[4] ?? "1", 10);
      currentHunk = { oldStart, oldLines, newStart, newLines, lines: [] };
      oldLineNum = oldStart;
      newLineNum = newStart;
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith("+") && !line.startsWith("+++")) {
      currentHunk.lines.push({
        type: "added",
        content: line.slice(1),
        oldLineNumber: null,
        newLineNumber: newLineNum++,
      });
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      currentHunk.lines.push({
        type: "removed",
        content: line.slice(1),
        oldLineNumber: oldLineNum++,
        newLineNumber: null,
      });
    } else if (line.startsWith(" ")) {
      currentHunk.lines.push({
        type: "context",
        content: line.slice(1),
        oldLineNumber: oldLineNum++,
        newLineNumber: newLineNum++,
      });
    }
    // Skip '\\ No newline at end of file', '---', '+++', 'index', mode lines
  }

  if (currentHunk) hunks.push(currentHunk);
  return hunks;
};

const parseFileDiff = (fileDiff: string): DiffFile | null => {
  const lines = fileDiff.split("\n");
  const diffLine = lines.find((l) => l.startsWith("diff --git"));
  if (!diffLine) return null;

  const pathMatch = diffLine.match(/diff --git a\/(.+) b\/(.+)/);
  if (!pathMatch) return null;

  const oldPath = pathMatch[1]!;
  const newPath = pathMatch[2]!;

  // Status detection (priority order)
  let status: DiffFile["status"] = "modified";
  if (lines.some((l) => l.startsWith("deleted file mode"))) status = "deleted";
  else if (lines.some((l) => l.startsWith("new file mode"))) status = "added";
  else if (lines.some((l) => l.startsWith("rename from")) || oldPath !== newPath)
    status = "renamed";

  const hunks = parseHunks(lines);

  let additions = 0;
  let deletions = 0;
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.type === "added") additions++;
      else if (line.type === "removed") deletions++;
    }
  }

  return { oldPath, newPath, status, additions, deletions, hunks };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Parse a full multi-file unified diff into structured DiffFile objects. */
export const parseDiff = (diffText: string): ReadonlyArray<DiffFile> => {
  if (!diffText.trim()) return [];
  const blocks = splitIntoFiles(diffText);
  const files: Array<DiffFile> = [];
  for (const block of blocks) {
    const parsed = parseFileDiff(block);
    if (parsed) files.push(parsed);
  }
  return files;
};

/** Parse a unified diff and return only the first file, or null. */
export const parseSingleFileDiff = (diffText: string): DiffFile | null => {
  const files = parseDiff(diffText);
  return files[0] ?? null;
};

/** Aggregate stats from already-parsed files. */
export const getDiffSummary = (files: ReadonlyArray<DiffFile>): DiffSummary => {
  let totalAdditions = 0;
  let totalDeletions = 0;
  for (const file of files) {
    totalAdditions += file.additions;
    totalDeletions += file.deletions;
  }
  return {
    totalFiles: files.length,
    totalAdditions,
    totalDeletions,
    filesAdded: files.filter((f) => f.status === "added").length,
    filesModified: files.filter((f) => f.status === "modified").length,
    filesDeleted: files.filter((f) => f.status === "deleted").length,
    filesRenamed: files.filter((f) => f.status === "renamed").length,
  };
};
