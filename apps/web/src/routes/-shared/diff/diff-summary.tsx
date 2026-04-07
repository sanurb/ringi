import type { DiffSummary as DiffSummaryType } from "@ringi/core/schemas/diff";

export function DiffSummary({ summary }: { summary: DiffSummaryType }) {
  const hasMoves = summary.filesMoved > 0 || summary.filesMovedModified > 0;
  if (
    summary.totalAdditions === 0 &&
    summary.totalDeletions === 0 &&
    !hasMoves
  ) {
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
      {summary.filesMoved > 0 ? (
        <span
          className="text-diff-move-text"
          title={`${summary.filesMoved} pure move${summary.filesMoved > 1 ? "s" : ""}`}
        >
          ↷{summary.filesMoved}
        </span>
      ) : null}
      {summary.filesMovedModified > 0 ? (
        <span
          className="text-diff-move-modified-text"
          title={`${summary.filesMovedModified} move${summary.filesMovedModified > 1 ? "s" : ""} with changes`}
        >
          ↷̃{summary.filesMovedModified}
        </span>
      ) : null}
    </div>
  );
}
