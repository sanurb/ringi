import type { Comment } from "@ringi/core/schemas/comment";
import type { DiffFile as DiffFileType } from "@ringi/core/schemas/diff";
import { useMemo } from "react";

import { DiffFile } from "./diff-file";
import type { LocalComment } from "./diff-file";

const EMPTY_COMMENTS: readonly Comment[] = [];

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
  comments = EMPTY_COMMENTS,
  onLocalCommentsChange,
  viewed = false,
  onToggleViewed,
  pendingDeleteId,
  onPendingDeleteHandled,
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
  pendingDeleteId?: string | null;
  onPendingDeleteHandled?: () => void;
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
      pendingDeleteId={pendingDeleteId}
      onPendingDeleteHandled={onPendingDeleteHandled}
    />
  );
};
