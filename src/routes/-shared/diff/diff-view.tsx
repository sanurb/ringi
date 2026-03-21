import { useEffect, useRef } from "react";

import type { Comment } from "@/api/schemas/comment";
import type {
  DiffFile as DiffFileType,
  DiffSummary as DiffSummaryType,
} from "@/api/schemas/diff";

import { DiffFile } from "./diff-file";
import { DiffSummary } from "./diff-summary";

export const DiffView = ({
  files,
  summary,
  reviewId,
  diffMode = "split",
  selectedFile,
  comments = [],
}: {
  files: readonly DiffFileType[];
  summary: DiffSummaryType;
  reviewId?: string;
  diffMode?: "split" | "unified";
  selectedFile?: string | null;
  comments?: readonly Comment[];
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedFile || !containerRef.current) {
      return;
    }

    const id = `diff-file-${selectedFile.replaceAll("/", "-")}`;
    const element = containerRef.current.querySelector(`#${CSS.escape(id)}`);
    element?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedFile]);

  if (files.length === 0) {
    return (
      <div className="rounded-sm border border-border-default bg-surface-elevated p-8 text-center">
        <p className="text-sm text-text-tertiary">No changes to display.</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="space-y-3">
      <DiffSummary summary={summary} />
      <div className="space-y-2">
        {files.map((file, index) => {
          const fileComments = comments.filter(
            (comment) => comment.filePath === file.newPath
          );

          return (
            <DiffFile
              key={file.newPath}
              file={file}
              comments={fileComments}
              defaultExpanded={index < 5}
              diffMode={diffMode}
              reviewId={reviewId}
            />
          );
        })}
      </div>
    </div>
  );
};
