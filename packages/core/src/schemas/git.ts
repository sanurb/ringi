import * as Schema from "effect/Schema";

export const RepositoryInfo = Schema.Struct({
  branch: Schema.String,
  name: Schema.String,
  path: Schema.String,
  remote: Schema.NullOr(Schema.String),
});
export type RepositoryInfo = typeof RepositoryInfo.Type;

export interface FileTreeNode {
  readonly name: string;
  readonly path: string;
  readonly type: "file" | "directory";
  readonly children?: readonly FileTreeNode[];
  readonly isChanged?: boolean;
}

export const FileTreeNode: Schema.Schema<FileTreeNode> = Schema.suspend(() =>
  Schema.Struct({
    children: Schema.Array(FileTreeNode).pipe(Schema.optionalKey),
    isChanged: Schema.Boolean.pipe(Schema.optionalKey),
    name: Schema.String,
    path: Schema.String,
    type: Schema.Literals(["file", "directory"]),
  })
);

export const FileContentAtRef = Schema.Struct({
  content: Schema.String,
  isBinary: Schema.Boolean,
  lineCount: Schema.Number,
  lines: Schema.Array(Schema.String),
  path: Schema.String,
  ref: Schema.String,
});
export type FileContentAtRef = typeof FileContentAtRef.Type;

export const BranchInfo = Schema.Struct({
  current: Schema.Boolean,
  name: Schema.String,
});
export type BranchInfo = typeof BranchInfo.Type;

export const CommitInfo = Schema.Struct({
  author: Schema.String,
  date: Schema.String,
  hash: Schema.String,
  message: Schema.String,
});
export type CommitInfo = typeof CommitInfo.Type;
