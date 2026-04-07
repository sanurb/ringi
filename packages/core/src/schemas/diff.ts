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
