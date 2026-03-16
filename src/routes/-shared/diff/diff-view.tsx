import type { DiffFile as DiffFileType, DiffSummary as DiffSummaryType } from "@/api/schemas/diff";
import { DiffSummary } from "./diff-summary";
import { DiffFile } from "./diff-file";

export function DiffView({
  files,
  summary,
}: {
  files: ReadonlyArray<DiffFileType>;
  summary: DiffSummaryType;
}) {
  if (files.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-surface-elevated p-8 text-center">
        <p className="text-gray-400">No changes to display.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DiffSummary summary={summary} />
      <div className="space-y-3">
        {files.map((file, i) => (
          <DiffFile key={file.newPath} file={file} defaultExpanded={i < 5} />
        ))}
      </div>
    </div>
  );
}
