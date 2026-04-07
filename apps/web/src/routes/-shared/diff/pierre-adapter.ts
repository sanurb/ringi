import type { FileContents } from "@pierre/diffs/react";
import type { DiffFile, DiffHunk, DiffLine } from "@ringi/core/schemas/diff";

/**
 * Reconstruct a unified diff patch string from ringi's DiffFile schema.
 *
 * @pierre/diffs has a well-tested patch parser that produces correct
 * FileDiffMetadata (with all line indices, hunk counts, etc.) from a
 * patch string.  Building FileDiffMetadata by hand is fragile because
 * the internal renderer relies on exact index alignment between
 * deletionLines/additionLines arrays and hunkContent groups.
 *
 * By reconstructing the patch text and using PatchDiff, we delegate
 * all that bookkeeping to the library's own parser.
 */
export function toPatchString(file: DiffFile): string {
  const oldPath = file.oldPath || file.newPath;
  const { newPath } = file;
  const header = `--- a/${oldPath}\n+++ b/${newPath}`;
  const hunks = file.hunks.map(hunkToPatch);
  return [header, ...hunks].join("\n");
}

function hunkToPatch(hunk: DiffHunk): string {
  const header = `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
  const lines = hunk.lines.map(lineToPatch);
  return [header, ...lines].join("\n");
}

/**
 * Map line types to unified diff prefixes.
 * Moved/moved-modified lines retain their original +/- semantics
 * (they're still additions/deletions in the patch) but get visual
 * distinction via CSS.
 */
function lineToPatchPrefix(line: DiffLine): string {
  switch (line.type) {
    case "added":
    case "moved":
    case "moved-modified":
      // Moved lines that were matched from "added" side keep +
      // Moved lines matched from "removed" side: check oldLineNumber
      return line.oldLineNumber !== null && line.newLineNumber === null
        ? "-"
        : "+";
    case "removed":
      return "-";
    case "context":
      return " ";
  }
}

function lineToPatch(line: DiffLine): string {
  return `${lineToPatchPrefix(line)}${line.content}`;
}

/** Build a full multi-file patch string for multiple DiffFiles. */
export function toMultiFilePatch(files: readonly DiffFile[]): string {
  return files.map(toPatchString).join("\n");
}

export function toPierreFileContents(
  path: string,
  lines: string[]
): FileContents {
  return { contents: lines.join("\n"), name: path };
}

// ---------------------------------------------------------------------------
// Move-detection CSS injection
// ---------------------------------------------------------------------------

interface MovedLineInfo {
  /** Line numbers on the additions side that are pure moves */
  movedAdditions: readonly number[];
  /** Line numbers on the deletions side that are pure moves */
  movedDeletions: readonly number[];
  /** Line numbers on the additions side that are moves with formatting changes */
  movedModifiedAdditions: readonly number[];
  /** Line numbers on the deletions side that are moves with formatting changes */
  movedModifiedDeletions: readonly number[];
}

/**
 * Extract moved line numbers from a DiffFile for CSS injection.
 */
export function getMovedLines(file: DiffFile): MovedLineInfo {
  const movedAdditions: number[] = [];
  const movedDeletions: number[] = [];
  const movedModifiedAdditions: number[] = [];
  const movedModifiedDeletions: number[] = [];

  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.type === "moved") {
        if (line.newLineNumber !== null)
          movedAdditions.push(line.newLineNumber);
        if (line.oldLineNumber !== null)
          movedDeletions.push(line.oldLineNumber);
      } else if (line.type === "moved-modified") {
        if (line.newLineNumber !== null)
          movedModifiedAdditions.push(line.newLineNumber);
        if (line.oldLineNumber !== null)
          movedModifiedDeletions.push(line.oldLineNumber);
      }
    }
  }

  return {
    movedAdditions,
    movedDeletions,
    movedModifiedAdditions,
    movedModifiedDeletions,
  };
}

/**
 * Build a CSS string to inject into @pierre/diffs shadow DOM that overrides
 * the default green/red backgrounds for moved lines with yellow tones.
 *
 * Uses :nth-of-type selectors targeting specific line-number rows.
 * Light yellow = pure move, dark yellow = moved + reformatted.
 */
export function buildMoveUnsafeCSS(info: MovedLineInfo): string {
  const rules: string[] = [];

  const moveColor = "var(--color-diff-move-line-bg, rgba(210, 153, 34, 0.08))";
  const moveModColor =
    "var(--color-diff-move-modified-line-bg, rgba(182, 120, 14, 0.1))";

  // Build selectors for each line number on each side
  for (const ln of info.movedAdditions) {
    rules.push(
      `[data-column-number="${ln}"][data-column-type="addition"] { background-color: ${moveColor} !important; }`
    );
  }
  for (const ln of info.movedDeletions) {
    rules.push(
      `[data-column-number="${ln}"][data-column-type="deletion"] { background-color: ${moveColor} !important; }`
    );
  }
  for (const ln of info.movedModifiedAdditions) {
    rules.push(
      `[data-column-number="${ln}"][data-column-type="addition"] { background-color: ${moveModColor} !important; }`
    );
  }
  for (const ln of info.movedModifiedDeletions) {
    rules.push(
      `[data-column-number="${ln}"][data-column-type="deletion"] { background-color: ${moveModColor} !important; }`
    );
  }

  return rules.join("\n");
}
