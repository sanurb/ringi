import type { DiffSummary as DiffSummaryType } from "@ringi/core/schemas/diff";

export function DiffSummary({ summary }: { summary: DiffSummaryType }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-text-secondary">
        {summary.totalFiles} file{summary.totalFiles !== 1 && "s"} changed
      </span>
      <span className="text-diff-add-text">+{summary.totalAdditions}</span>
      <span className="text-diff-remove-text">-{summary.totalDeletions}</span>
    </div>
  );
}
