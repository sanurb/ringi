import type {
  DiffFile,
  DiffHunk,
  DiffLine,
  DiffSummary,
} from "../schemas/diff";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const HUNK_HEADER = /@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

const splitIntoFiles = (diffText: string): readonly string[] => {
  const files: string[] = [];
  const lines = diffText.split("\n");
  let current: string[] = [];
  for (const line of lines) {
    if (line.startsWith("diff --git")) {
      if (current.length > 0) {
        files.push(current.join("\n"));
      }
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) {
    files.push(current.join("\n"));
  }
  return files;
};

const parseHunks = (lines: readonly string[]): readonly DiffHunk[] => {
  const hunks: DiffHunk[] = [];
  let currentHunk: {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: DiffLine[];
  } | null = null;
  let oldLineNum = 0;
  let newLineNum = 0;

  for (const line of lines) {
    const match = line.match(HUNK_HEADER);
    if (match) {
      if (currentHunk) {
        hunks.push(currentHunk);
      }
      const oldStart = Number.parseInt(match[1]!, 10);
      const oldLines = Number.parseInt(match[2] ?? "1", 10);
      const newStart = Number.parseInt(match[3]!, 10);
      const newLines = Number.parseInt(match[4] ?? "1", 10);
      currentHunk = { lines: [], newLines, newStart, oldLines, oldStart };
      oldLineNum = oldStart;
      newLineNum = newStart;
      continue;
    }

    if (!currentHunk) {
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      currentHunk.lines.push({
        content: line.slice(1),
        newLineNumber: newLineNum++,
        oldLineNumber: null,
        type: "added",
      });
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      currentHunk.lines.push({
        content: line.slice(1),
        newLineNumber: null,
        oldLineNumber: oldLineNum++,
        type: "removed",
      });
    } else if (line.startsWith(" ")) {
      currentHunk.lines.push({
        content: line.slice(1),
        newLineNumber: newLineNum++,
        oldLineNumber: oldLineNum++,
        type: "context",
      });
    }
    // Skip '\\ No newline at end of file', '---', '+++', 'index', mode lines
  }

  if (currentHunk) {
    hunks.push(currentHunk);
  }
  return hunks;
};

const parseFileDiff = (fileDiff: string): DiffFile | null => {
  const lines = fileDiff.split("\n");
  const diffLine = lines.find((l) => l.startsWith("diff --git"));
  if (!diffLine) {
    return null;
  }

  const pathMatch = diffLine.match(/diff --git a\/(.+) b\/(.+)/);
  if (!pathMatch) {
    return null;
  }

  const oldPath = pathMatch[1]!;
  const newPath = pathMatch[2]!;

  // Status detection (priority order)
  let status: DiffFile["status"] = "modified";
  if (lines.some((l) => l.startsWith("deleted file mode"))) {
    status = "deleted";
  } else if (lines.some((l) => l.startsWith("new file mode"))) {
    status = "added";
  } else if (
    lines.some((l) => l.startsWith("rename from")) ||
    oldPath !== newPath
  ) {
    status = "renamed";
  }

  const hunks = parseHunks(lines);

  let additions = 0;
  let deletions = 0;
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.type === "added") {
        additions++;
      } else if (line.type === "removed") {
        deletions++;
      }
    }
  }

  return { additions, deletions, hunks, newPath, oldPath, status };
};

// ---------------------------------------------------------------------------
// Move detection
// ---------------------------------------------------------------------------

/**
 * Normalize a line for move comparison:
 * strip leading/trailing whitespace so pure-formatting moves still match.
 */
const normalizeLine = (content: string): string => content.trim();

/**
 * Detect moved lines across all files in a diff.
 *
 * Algorithm:
 * 1. Collect all removed lines (keyed by normalized content).
 * 2. For each added line, check if a removed line with the same normalized
 *    content exists.
 * 3. If the raw content is identical → "moved" (pure move).
 *    If only the normalized content matches → "moved-modified" (moved + reformatted).
 * 4. Mark both the removed and added line.
 *
 * This is the same approach Phabricator uses: yellow for pure moves,
 * dark yellow for moves with formatting changes.
 */
const detectMoves = (files: DiffFile[]): void => {
  // Build index: normalized content → list of removed line references
  const removedIndex = new Map<
    string,
    { line: DiffLine; matched: boolean }[]
  >();

  for (const file of files) {
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.type !== "removed") continue;
        const key = normalizeLine(line.content);
        if (!key) continue; // skip empty lines
        let bucket = removedIndex.get(key);
        if (!bucket) {
          bucket = [];
          removedIndex.set(key, bucket);
        }
        bucket.push({ line, matched: false });
      }
    }
  }

  // Match added lines against removed lines
  for (const file of files) {
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.type !== "added") continue;
        const key = normalizeLine(line.content);
        if (!key) continue;
        const bucket = removedIndex.get(key);
        if (!bucket) continue;

        // Find first unmatched removed line
        const entry = bucket.find((e) => !e.matched);
        if (!entry) continue;

        entry.matched = true;

        // Exact raw content → pure move; otherwise move + formatting change
        const isPureMove = entry.line.content === line.content;
        const moveType: DiffLine["type"] = isPureMove
          ? "moved"
          : "moved-modified";

        // Mutate both lines in-place (they're already in the file structs)
        (entry.line as { type: DiffLine["type"] }).type = moveType;
        (line as { type: DiffLine["type"] }).type = moveType;
      }
    }
  }
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Parse a full multi-file unified diff into structured DiffFile objects. */
export const parseDiff = (diffText: string): readonly DiffFile[] => {
  if (!diffText.trim()) {
    return [];
  }
  const blocks = splitIntoFiles(diffText);
  const files: DiffFile[] = [];
  for (const block of blocks) {
    const parsed = parseFileDiff(block);
    if (parsed) {
      files.push(parsed);
    }
  }
  detectMoves(files);
  return files;
};

/** Parse a unified diff and return only the first file, or null. */
export const parseSingleFileDiff = (diffText: string): DiffFile | null => {
  const files = parseDiff(diffText);
  return files[0] ?? null;
};

/** Aggregate stats from already-parsed files. */
export const getDiffSummary = (files: readonly DiffFile[]): DiffSummary => {
  let totalAdditions = 0;
  let totalDeletions = 0;
  for (const file of files) {
    totalAdditions += file.additions;
    totalDeletions += file.deletions;
  }
  return {
    filesAdded: files.filter((f) => f.status === "added").length,
    filesDeleted: files.filter((f) => f.status === "deleted").length,
    filesModified: files.filter((f) => f.status === "modified").length,
    filesMoved: files.filter((f) => f.status === "moved").length,
    filesMovedModified: files.filter((f) => f.status === "moved-modified")
      .length,
    filesRenamed: files.filter((f) => f.status === "renamed").length,
    totalAdditions,
    totalDeletions,
    totalFiles: files.length,
  };
};
