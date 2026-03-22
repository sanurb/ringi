import * as Effect from "effect/Effect";
import { useState, useCallback } from "react";

import { ApiClient } from "@/api/api-client";
import type { ReviewId } from "@/api/schemas/review";
import { AppSettingsControl } from "@/components/settings/app-settings-control";
import { clientRuntime } from "@/lib/client-runtime";
import { cn } from "@/lib/utils";

interface ActionBarProps {
  repoName?: string;
  branchName?: string;
  status?: string;
  reviewId?: string;
  onStatusChange?: (status: string) => void;
  onToggleDiffMode?: () => void;
  diffMode?: "split" | "unified";
  commentCount?: number;
  isAnnotationsOpen?: boolean;
  onToggleAnnotations?: () => void;
  onExport?: () => void;
}

const statusStyles: Record<string, string> = {
  active: "bg-accent-muted text-accent-primary",
  approved: "bg-diff-add-bg text-status-success",
  changes_requested: "bg-diff-remove-bg text-status-error",
  draft: "bg-surface-elevated text-text-tertiary",
};

const buttonMotionClass =
  "[transition-timing-function:cubic-bezier(0.23,1,0.32,1)] motion-reduce:transform-none";

const smallButtonMotionClass = `transition-[transform,background-color,color,border-color,box-shadow,opacity] duration-150 ${buttonMotionClass}`;

const mediumButtonMotionClass = `transition-[transform,background-color,color,border-color,box-shadow,opacity] duration-200 ${buttonMotionClass}`;

function StatusBadge({ status }: { status: string }) {
  const style = statusStyles[status] ?? statusStyles.draft;
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium capitalize transition-colors duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
        style
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
    <div className="relative grid grid-cols-2 items-center rounded-md border border-border-default bg-surface-secondary p-0.5">
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-[5px] bg-accent-muted shadow-sm transition-[transform,background-color,box-shadow] duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] motion-reduce:transform-none",
          diffMode === "unified" && "translate-x-full"
        )}
      />
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={diffMode === "split"}
        className={cn(
          "relative z-10 rounded-[5px] px-2.5 py-1 text-xs transition-[transform,color,opacity] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] motion-reduce:transform-none",
          diffMode === "split"
            ? "font-medium text-text-primary"
            : "text-text-tertiary hover:text-text-secondary"
        )}
      >
        Split
      </button>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={diffMode === "unified"}
        className={cn(
          "relative z-10 rounded-[5px] px-2.5 py-1 text-xs transition-[transform,color,opacity] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] motion-reduce:transform-none",
          diffMode === "unified"
            ? "font-medium text-text-primary"
            : "text-text-tertiary hover:text-text-secondary"
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
      className={cn(
        "rounded-sm px-2 py-1 text-xs text-text-secondary hover:bg-surface-elevated hover:text-text-primary active:scale-[0.97]",
        smallButtonMotionClass
      )}
    >
      {children}
    </button>
  );
}

/** Speech-bubble SVG icon for annotations toggle */
function AnnotationsIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={cn("h-3.5 w-3.5", className)}
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
  isAnnotationsOpen = false,
  onToggleAnnotations,
  onExport,
}: ActionBarProps) {
  const [copyLabel, setCopyLabel] = useState("Copy Diff");

  const handleCopyDiff = useCallback(() => {
    if (!reviewId) {
      return;
    }
    clientRuntime.runFork(
      Effect.gen(function* handleCopyDiff() {
        const { http } = yield* ApiClient;
        return yield* http.export.markdown({
          path: { id: reviewId as ReviewId },
        });
      }).pipe(
        Effect.tap((markdown) =>
          Effect.promise(() => navigator.clipboard.writeText(markdown))
        ),
        Effect.tap(() =>
          Effect.sync(() => {
            setCopyLabel("Copied!");
            setTimeout(() => setCopyLabel("Copy Diff"), 1500);
          })
        ),
        Effect.catchAllCause(() => Effect.void)
      )
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
              className={cn(
                "rounded-sm border border-border-default bg-surface-elevated px-3 py-1 text-xs text-text-secondary hover:border-status-error/30 hover:text-status-error active:scale-[0.97]",
                smallButtonMotionClass
              )}
            >
              Request Changes
            </button>
            <button
              type="button"
              disabled={isApproved}
              onClick={() => onStatusChange?.("approved")}
              className={cn(
                "rounded-sm px-3 py-1 text-xs font-medium",
                mediumButtonMotionClass,
                isApproved
                  ? "cursor-default bg-diff-add-bg text-status-success opacity-70"
                  : "bg-accent-primary text-white hover:bg-accent-primary-hover hover:shadow-sm hover:shadow-accent-primary/20 active:scale-[0.97]"
              )}
            >
              {isApproved ? "Approved" : "Approve"}
            </button>
          </>
        )}
        {commentCount != null && commentCount > 0 && (
          <span className="rounded-full bg-accent-muted px-1.5 py-0.5 text-xs tabular-nums text-accent-primary transition-transform duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] motion-reduce:transform-none">
            {commentCount}
          </span>
        )}
        <button
          type="button"
          onClick={onToggleAnnotations}
          aria-pressed={isAnnotationsOpen}
          className={cn(
            "rounded-sm p-1 text-text-secondary hover:bg-surface-elevated hover:text-text-primary active:scale-[0.97]",
            smallButtonMotionClass
          )}
          title="Toggle annotations"
        >
          <AnnotationsIcon
            className={cn(
              "transition-[transform,opacity,color] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] motion-reduce:transform-none",
              isAnnotationsOpen ? "rotate-6 opacity-100" : "opacity-80"
            )}
          />
        </button>
        <GhostButton onClick={onExport}>Export</GhostButton>
        <AppSettingsControl />
      </div>
    </div>
  );
}
