import * as Schema from "effect/Schema";

export const RepositoryInfo = Schema.Struct({
  name: Schema.String,
  branch: Schema.String,
  remote: Schema.NullOr(Schema.String),
  path: Schema.String,
});
export type RepositoryInfo = typeof RepositoryInfo.Type;

export interface FileTreeNode {
  readonly name: string;
  readonly path: string;
  readonly type: "file" | "directory";
  readonly children?: ReadonlyArray<FileTreeNode>;
  readonly isChanged?: boolean;
}

export const FileTreeNode: Schema.Schema<FileTreeNode> = Schema.suspend(() =>
  Schema.Struct({
    name: Schema.String,
    path: Schema.String,
    type: Schema.Literal("file", "directory"),
    children: Schema.optional(Schema.Array(FileTreeNode)),
    isChanged: Schema.optional(Schema.Boolean),
  }),
);

export const FileContentAtRef = Schema.Struct({
  path: Schema.String,
  ref: Schema.String,
  content: Schema.String,
  lines: Schema.Array(Schema.String),
  lineCount: Schema.Number,
  isBinary: Schema.Boolean,
});
export type FileContentAtRef = typeof FileContentAtRef.Type;

export const BranchInfo = Schema.Struct({
  name: Schema.String,
  current: Schema.Boolean,
});
export type BranchInfo = typeof BranchInfo.Type;

export const CommitInfo = Schema.Struct({
  hash: Schema.String,
  message: Schema.String,
  author: Schema.String,
  date: Schema.String,
});
export type CommitInfo = typeof CommitInfo.Type;
