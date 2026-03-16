import { clsx } from "clsx";
import type { DiffFileMetadata, DiffStatus } from "@/api/schemas/diff";

const statusColors: Record<DiffStatus, string> = {
  added: "text-green-400",
  modified: "text-yellow-400",
  deleted: "text-red-400",
  renamed: "text-purple-400",
};

const statusLabels: Record<DiffStatus, string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
};

export function Sidebar({
  files,
  selectedFile,
  onSelectFile,
}: {
  files: ReadonlyArray<DiffFileMetadata>;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
}) {
  return (
    <div className="w-64 shrink-0 border-r border-gray-800 bg-surface-secondary overflow-y-auto">
      <div className="p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Files ({files.length})
        </h3>
        <div className="space-y-0.5">
          {files.map((file) => (
            <button
              key={file.newPath}
              onClick={() => onSelectFile(file.newPath)}
              className={clsx(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition",
                selectedFile === file.newPath
                  ? "bg-accent-cyan/10 text-accent-cyan"
                  : "text-gray-400 hover:bg-surface-elevated hover:text-gray-200",
              )}
            >
              <span
                className={clsx(
                  "w-4 shrink-0 text-center font-medium",
                  statusColors[file.status],
                )}
              >
                {statusLabels[file.status]}
              </span>
              <span className="truncate font-mono">{file.newPath}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
