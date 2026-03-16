import type { DiffSummary as DiffSummaryType } from "@/api/schemas/diff";

export function DiffSummary({ summary }: { summary: DiffSummaryType }) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-gray-800 bg-surface-elevated px-4 py-2 text-sm">
      <span className="text-gray-400">
        {summary.totalFiles} file{summary.totalFiles !== 1 && "s"} changed
      </span>
      <span className="text-green-400">+{summary.totalAdditions}</span>
      <span className="text-red-400">-{summary.totalDeletions}</span>
    </div>
  );
}
