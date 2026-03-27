import type { DiffSummary as DiffSummaryType } from "@ringi/core/schemas/diff";

export function DiffSummary({ summary }: { summary: DiffSummaryType }) {
  if (summary.totalAdditions === 0 && summary.totalDeletions === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-xs tabular-nums">
      {summary.totalAdditions > 0 ? (
        <span className="text-diff-add-text">+{summary.totalAdditions}</span>
      ) : null}
      {summary.totalDeletions > 0 ? (
        <span className="text-diff-remove-text">-{summary.totalDeletions}</span>
      ) : null}
    </div>
  );
}
