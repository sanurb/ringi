import * as Schema from "effect/Schema";

export const DiffStatus = Schema.Literal("added", "modified", "deleted", "renamed");
export type DiffStatus = typeof DiffStatus.Type;

export const DiffLineType = Schema.Literal("added", "removed", "context");
export type DiffLineType = typeof DiffLineType.Type;

export const DiffLine = Schema.Struct({
  type: DiffLineType,
  content: Schema.String,
  oldLineNumber: Schema.NullOr(Schema.Number),
  newLineNumber: Schema.NullOr(Schema.Number),
});
export type DiffLine = typeof DiffLine.Type;

export const DiffHunk = Schema.Struct({
  oldStart: Schema.Number,
  oldLines: Schema.Number,
  newStart: Schema.Number,
  newLines: Schema.Number,
  lines: Schema.Array(DiffLine),
});
export type DiffHunk = typeof DiffHunk.Type;

export const DiffFile = Schema.Struct({
  oldPath: Schema.String,
  newPath: Schema.String,
  status: DiffStatus,
  additions: Schema.Number,
  deletions: Schema.Number,
  hunks: Schema.Array(DiffHunk),
});
export type DiffFile = typeof DiffFile.Type;

export const DiffFileMetadata = Schema.Struct({
  oldPath: Schema.String,
  newPath: Schema.String,
  status: DiffStatus,
  additions: Schema.Number,
  deletions: Schema.Number,
});
export type DiffFileMetadata = typeof DiffFileMetadata.Type;

export const DiffSummary = Schema.Struct({
  totalFiles: Schema.Number,
  totalAdditions: Schema.Number,
  totalDeletions: Schema.Number,
  filesAdded: Schema.Number,
  filesModified: Schema.Number,
  filesDeleted: Schema.Number,
  filesRenamed: Schema.Number,
});
export type DiffSummary = typeof DiffSummary.Type;
