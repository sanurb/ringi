import type { DiffHunk as DiffHunkType } from "@/api/schemas/diff";
import { DiffLine } from "./diff-line";

export function DiffHunk({ hunk }: { hunk: DiffHunkType }) {
  return (
    <div>
      <div className="bg-surface-primary/80 px-4 py-1 text-xs text-gray-500 font-mono">
        @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
      </div>
      <div>
        {hunk.lines.map((line, i) => (
          <DiffLine key={i} line={line} />
        ))}
      </div>
    </div>
  );
}
