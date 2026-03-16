import { useEffect, useRef } from "react";
import type {
  DiffFile as DiffFileType,
  DiffSummary as DiffSummaryType,
} from "@/api/schemas/diff";
import { DiffSummary } from "./diff-summary";
import { DiffFile } from "./diff-file";

export function DiffView({
  files,
  summary,
  reviewId,
  diffMode = "split",
  selectedFile,
}: {
  files: ReadonlyArray<DiffFileType>;
  summary: DiffSummaryType;
  reviewId?: string;
  diffMode?: "split" | "unified";
  selectedFile?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll selected file into view
  useEffect(() => {
    if (!selectedFile || !containerRef.current) return;

    const id = `diff-file-${selectedFile.replace(/\//g, "-")}`;
    const el = containerRef.current.querySelector(`#${CSS.escape(id)}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedFile]);

  if (files.length === 0) {
    return (
      <div className="rounded-sm border border-border-default bg-surface-elevated p-8 text-center">
        <p className="text-text-tertiary text-sm">No changes to display.</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="space-y-3">
      <DiffSummary summary={summary} />
      <div className="space-y-2">
        {files.map((file, i) => (
          <DiffFile
            key={file.newPath}
            file={file}
            defaultExpanded={i < 5}
            reviewId={reviewId}
            diffMode={diffMode}
          />
        ))}
      </div>
    </div>
  );
}
