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

const LINE_PREFIX: Record<DiffLine["type"], string> = {
  added: "+",
  context: " ",
  removed: "-",
};

function lineToPatch(line: DiffLine): string {
  return `${LINE_PREFIX[line.type]}${line.content}`;
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
