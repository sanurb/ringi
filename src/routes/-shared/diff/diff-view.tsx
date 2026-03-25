import { useMemo } from "react";

import type { Comment } from "@/api/schemas/comment";
import type { DiffFile as DiffFileType } from "@/api/schemas/diff";

import { DiffFile } from "./diff-file";
import type { LocalComment } from "./diff-file";

/**
 * Single-file diff renderer.
 *
 * Renders **only** the currently selected file. The previous implementation
 * mounted every DiffFile in the review, which meant N × PatchDiff instances
 * on load. This version renders exactly one.
 */
export const DiffView = ({
  file,
  reviewId,
  diffMode = "split",
  comments = [],
  onLocalCommentsChange,
  viewed = false,
  onToggleViewed,
}: {
  file: DiffFileType;
  reviewId?: string;
  diffMode?: "split" | "unified";
  comments?: readonly Comment[];
  onLocalCommentsChange?: (
    filePath: string,
    localComments: readonly LocalComment[]
  ) => void;
  viewed?: boolean;
  onToggleViewed?: (filePath: string) => void;
}) => {
  const fileComments = useMemo(
    () => comments.filter((c) => c.filePath === file.newPath),
    [comments, file.newPath]
  );

  return (
    <DiffFile
      key={file.newPath}
      file={file}
      comments={fileComments}
      defaultExpanded
      diffMode={diffMode}
      reviewId={reviewId}
      onLocalCommentsChange={onLocalCommentsChange}
      viewed={viewed}
      onToggleViewed={onToggleViewed}
    />
  );
};
