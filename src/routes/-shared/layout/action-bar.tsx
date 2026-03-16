import { useState, useCallback } from "react";
import * as Effect from "effect/Effect";
import { cn } from "@/lib/utils";
import { clientRuntime } from "@/lib/client-runtime";
import { ApiClient } from "@/api/api-client";
import type { ReviewId } from "@/api/schemas/review";

interface ActionBarProps {
  repoName?: string;
  branchName?: string;
  status?: string;
  reviewId?: string;
  onStatusChange?: (status: string) => void;
  onToggleDiffMode?: () => void;
  diffMode?: "split" | "unified";
  commentCount?: number;
  onToggleAnnotations?: () => void;
  onExport?: () => void;
}

const statusStyles: Record<string, string> = {
  active: "bg-accent-muted text-accent-primary",
  approved: "bg-diff-add-bg text-status-success",
  changes_requested: "bg-diff-remove-bg text-status-error",
  draft: "bg-surface-elevated text-text-tertiary",
};

function StatusBadge({ status }: { status: string }) {
  const style = statusStyles[status] ?? statusStyles.draft;
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        style,
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function SegmentedControl({
  diffMode,
  onToggle,
}: {
  diffMode: "split" | "unified";
  onToggle?: () => void;
}) {
  return (
    <div className="flex items-center rounded-md border border-border-default">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "rounded-l-md px-2.5 py-1 text-xs transition-colors",
          diffMode === "split"
            ? "bg-accent-muted text-text-primary"
            : "text-text-tertiary hover:text-text-secondary",
        )}
      >
        Split
      </button>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "rounded-r-md border-l border-border-default px-2.5 py-1 text-xs transition-colors",
          diffMode === "unified"
            ? "bg-accent-muted text-text-primary"
            : "text-text-tertiary hover:text-text-secondary",
        )}
      >
        Unified
      </button>
    </div>
  );
}

function GhostButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-sm px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary"
    >
      {children}
    </button>
  );
}

/** Speech-bubble SVG icon for annotations toggle */
function AnnotationsIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="h-3.5 w-3.5"
    >
      <path d="M1 3.5A2.5 2.5 0 0 1 3.5 1h9A2.5 2.5 0 0 1 15 3.5v6a2.5 2.5 0 0 1-2.5 2.5H9l-3.5 3v-3H3.5A2.5 2.5 0 0 1 1 9.5v-6Z" />
    </svg>
  );
}

export function ActionBar({
  repoName,
  branchName,
  status,
  reviewId,
  onStatusChange,
  onToggleDiffMode,
  diffMode = "split",
  commentCount,
  onToggleAnnotations,
  onExport,
}: ActionBarProps) {
  const [copyLabel, setCopyLabel] = useState("Copy Diff");

  const handleCopyDiff = useCallback(() => {
    if (!reviewId) return;
    clientRuntime.runFork(
      Effect.gen(function* () {
        const { http } = yield* ApiClient;
        return yield* http.export.markdown({
          path: { id: reviewId as ReviewId },
        });
      }).pipe(
        Effect.tap((markdown) =>
          Effect.promise(() => navigator.clipboard.writeText(markdown)),
        ),
        Effect.tap(() =>
          Effect.sync(() => {
            setCopyLabel("Copied!");
            setTimeout(() => setCopyLabel("Copy Diff"), 1500);
          }),
        ),
        Effect.catchAllCause(() => Effect.void),
      ),
    );
  }, [reviewId]);

  const isApproved = status === "approved";

  return (
    <div className="flex h-10 items-center border-b border-border-default bg-surface-secondary px-4">
      {/* Left zone */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-text-primary">ringi</span>
        <span className="text-xs text-text-tertiary">v0.1</span>
        <span className="text-text-tertiary">|</span>
        {status && <StatusBadge status={status} />}
        {repoName && (
          <span className="font-mono text-xs text-text-secondary">
            {repoName}
            {branchName && (
              <span className="text-text-tertiary">:{branchName}</span>
            )}
          </span>
        )}
      </div>

      {/* Center zone */}
      <div className="flex flex-1 items-center justify-center">
        <SegmentedControl diffMode={diffMode} onToggle={onToggleDiffMode} />
      </div>

      {/* Right zone */}
      <div className="flex items-center gap-2">
        <GhostButton onClick={handleCopyDiff}>{copyLabel}</GhostButton>
        {reviewId && (
          <>
            <button
              type="button"
              onClick={() => onStatusChange?.("changes_requested")}
              className="rounded-sm border border-border-default bg-surface-elevated px-3 py-1 text-xs text-text-secondary transition-colors hover:border-status-error/30 hover:text-status-error"
            >
              Request Changes
            </button>
            <button
              type="button"
              disabled={isApproved}
              onClick={() => onStatusChange?.("approved")}
              className={cn(
                "rounded-sm px-3 py-1 text-xs font-medium transition-colors",
                isApproved
                  ? "cursor-default bg-diff-add-bg text-status-success opacity-70"
                  : "bg-accent-primary text-white hover:bg-accent-primary-hover",
              )}
            >
              {isApproved ? "Approved" : "Approve"}
            </button>
          </>
        )}
        {commentCount != null && commentCount > 0 && (
          <span className="rounded-full bg-accent-muted px-1.5 py-0.5 text-xs tabular-nums text-accent-primary">
            {commentCount}
          </span>
        )}
        <button
          type="button"
          onClick={onToggleAnnotations}
          className="rounded-sm p-1 text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary"
          title="Toggle annotations"
        >
          <AnnotationsIcon />
        </button>
        <GhostButton onClick={onExport}>Export</GhostButton>
      </div>
    </div>
  );
}
