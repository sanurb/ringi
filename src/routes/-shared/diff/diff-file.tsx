import { useState } from "react";
import { clsx } from "clsx";
import type { DiffFile as DiffFileType, DiffStatus } from "@/api/schemas/diff";
import { DiffHunk } from "./diff-hunk";

const statusBadge: Record<DiffStatus, { label: string; className: string }> = {
  added: { label: "A", className: "bg-green-500/20 text-green-400" },
  modified: { label: "M", className: "bg-yellow-500/20 text-yellow-400" },
  deleted: { label: "D", className: "bg-red-500/20 text-red-400" },
  renamed: { label: "R", className: "bg-purple-500/20 text-purple-400" },
};

export function DiffFile({
  file,
  defaultExpanded = false,
}: {
  file: DiffFileType;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const badge = statusBadge[file.status];

  return (
    <div
      id={`diff-file-${file.newPath.replace(/\//g, "-")}`}
      className="rounded-lg border border-gray-800 bg-surface-elevated overflow-hidden"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-card transition"
      >
        <span className="text-gray-500 text-xs">{expanded ? "▼" : "▶"}</span>
        <span
          className={clsx(
            "rounded px-1.5 py-0.5 text-xs font-medium",
            badge.className,
          )}
        >
          {badge.label}
        </span>
        <span className="flex-1 truncate font-mono text-sm text-gray-200">
          {file.newPath}
        </span>
        <span className="text-xs">
          <span className="text-green-400">+{file.additions}</span>{" "}
          <span className="text-red-400">-{file.deletions}</span>
        </span>
      </button>

      {expanded && (
        <div className="border-t border-gray-800">
          {file.hunks.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500 italic">
              No content changes (binary or mode change)
            </div>
          ) : (
            file.hunks.map((hunk, i) => <DiffHunk key={i} hunk={hunk} />)
          )}
        </div>
      )}
    </div>
  );
}
