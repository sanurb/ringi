import * as Schema from "effect/Schema";

export const DiffStatus = Schema.Literals([
  "added",
  "modified",
  "deleted",
  "renamed",
  "moved",
  "moved-modified",
]);
export type DiffStatus = typeof DiffStatus.Type;

export const DiffLineType = Schema.Literals([
  "added",
  "removed",
  "context",
  "moved",
  "moved-modified",
]);
export type DiffLineType = typeof DiffLineType.Type;

export const DiffLine = Schema.Struct({
  content: Schema.String,
  newLineNumber: Schema.NullOr(Schema.Number),
  oldLineNumber: Schema.NullOr(Schema.Number),
  type: DiffLineType,
});
export type DiffLine = typeof DiffLine.Type;

export const DiffHunk = Schema.Struct({
  lines: Schema.Array(DiffLine),
  newLines: Schema.Number,
  newStart: Schema.Number,
  oldLines: Schema.Number,
  oldStart: Schema.Number,
});
export type DiffHunk = typeof DiffHunk.Type;

export const DiffFile = Schema.Struct({
  additions: Schema.Number,
  deletions: Schema.Number,
  hunks: Schema.Array(DiffHunk),
  newPath: Schema.String,
  oldPath: Schema.String,
  status: DiffStatus,
});
export type DiffFile = typeof DiffFile.Type;

export const DiffFileMetadata = Schema.Struct({
  additions: Schema.Number,
  deletions: Schema.Number,
  newPath: Schema.String,
  oldPath: Schema.String,
  status: DiffStatus,
});
export type DiffFileMetadata = typeof DiffFileMetadata.Type;

export const DiffSummary = Schema.Struct({
  filesAdded: Schema.Number,
  filesDeleted: Schema.Number,
  filesModified: Schema.Number,
  filesRenamed: Schema.Number,
  filesMoved: Schema.Number,
  filesMovedModified: Schema.Number,
  totalAdditions: Schema.Number,
  totalDeletions: Schema.Number,
  totalFiles: Schema.Number,
});
export type DiffSummary = typeof DiffSummary.Type;

// ---------------------------------------------------------------------------
// Stable Hunk Identity
// ---------------------------------------------------------------------------

export const ReviewHunkId = Schema.String.pipe(Schema.brand("ReviewHunkId"));
export type ReviewHunkId = typeof ReviewHunkId.Type;

/**
 * Deterministic hunk identity from file path and diff position.
 * Stable across reloads and consistent across CLI/Web/MCP surfaces.
 *
 * Format: `{filePath}:@-{oldStart},{oldLines}+{newStart},{newLines}`
 */
export const deriveHunkId = (
  filePath: string,
  oldStart: number,
  oldLines: number,
  newStart: number,
  newLines: number,
): string => `${filePath}:@-${oldStart},${oldLines}+${newStart},${newLines}`;

const HUNK_ID_PATTERN =
  /^(.+):@-(\d+),(\d+)\+(\d+),(\d+)$/;

/**
 * Parse a stable hunk ID back into its components.
 * Returns `null` if the string does not match the expected format.
 */
export const parseHunkId = (
  stableId: string,
): {
  filePath: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
} | null => {
  const m = stableId.match(HUNK_ID_PATTERN);
  if (!m) return null;
  return {
    filePath: m[1]!,
    newLines: Number.parseInt(m[5]!, 10),
    newStart: Number.parseInt(m[4]!, 10),
    oldLines: Number.parseInt(m[3]!, 10),
    oldStart: Number.parseInt(m[2]!, 10),
  };
};

export const ReviewHunk = Schema.Struct({
  createdAt: Schema.String,
  hunkIndex: Schema.Number,
  id: ReviewHunkId,
  newLines: Schema.Number,
  newStart: Schema.Number,
  oldLines: Schema.Number,
  oldStart: Schema.Number,
  reviewFileId: Schema.String,
  stableId: Schema.String,
});
export type ReviewHunk = typeof ReviewHunk.Type;
