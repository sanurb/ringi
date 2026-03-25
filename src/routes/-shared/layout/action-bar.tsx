import * as Effect from "effect/Effect";
import { useState, useCallback } from "react";

import { ApiClient } from "@/api/api-client";
import type { ReviewId } from "@/api/schemas/review";
import { AppSettingsControl } from "@/components/settings/app-settings-control";
import { clientRuntime } from "@/lib/client-runtime";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------

const EASE_OUT = "[transition-timing-function:cubic-bezier(0.23,1,0.32,1)]";
const motionBase = `${EASE_OUT} motion-reduce:transform-none`;
const pressScale = "active:scale-[0.97]";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

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
  /** Selected file path for file-level actions. */
  selectedFilePath?: string | null;
  onGitAdd?: () => void;
  onCopyFileDiff?: () => void;
}

// ---------------------------------------------------------------------------
// Status badge (review context)
// ---------------------------------------------------------------------------

const statusStyles: Record<string, string> = {
  active: "bg-accent-muted text-accent-primary",
  approved: "bg-diff-add-bg text-status-success",
  changes_requested: "bg-diff-remove-bg text-status-error",
  draft: "bg-surface-elevated text-text-tertiary",
};

const StatusBadge = ({ status }: { status: string }) => {
  const style = statusStyles[status] ?? statusStyles.draft;
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
        style
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Segmented diff-mode control
// ---------------------------------------------------------------------------

const SegmentedControl = ({
  diffMode,
  onToggle,
}: {
  diffMode: "split" | "unified";
  onToggle?: () => void;
}) => (
  <div className="relative grid grid-cols-2 items-center rounded-md border border-border-default bg-surface-secondary p-0.5">
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-[5px] bg-accent-muted shadow-sm transition-transform duration-200",
        EASE_OUT,
        "motion-reduce:transform-none",
        diffMode === "unified" && "translate-x-full"
      )}
    />
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={diffMode === "split"}
      className={cn(
        `relative z-10 rounded-[5px] px-2.5 py-1 text-xs transition-color duration-150 ${pressScale}`,
        motionBase,
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
        `relative z-10 rounded-[5px] px-2.5 py-1 text-xs transition-color duration-150 ${pressScale}`,
        motionBase,
        diffMode === "unified"
          ? "font-medium text-text-primary"
          : "text-text-tertiary hover:text-text-secondary"
      )}
    >
      Unified
    </button>
  </div>
);

// ---------------------------------------------------------------------------
// Icon-only ghost button (for toolbar-level actions)
// ---------------------------------------------------------------------------

const ToolbarButton = ({
  children,
  onClick,
  title,
  pressed,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  pressed?: boolean;
  disabled?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    disabled={disabled}
    aria-pressed={pressed}
    className={cn(
      `inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-[transform,background-color,color,opacity] duration-150 ${pressScale}`,
      motionBase,
      disabled
        ? "cursor-default opacity-40"
        : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
    )}
  >
    {children}
  </button>
);

// ---------------------------------------------------------------------------
// Annotation icon
// ---------------------------------------------------------------------------

const AnnotationsIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    fill="currentColor"
    className={cn("h-3.5 w-3.5", className)}
  >
    <path d="M1 3.5A2.5 2.5 0 0 1 3.5 1h9A2.5 2.5 0 0 1 15 3.5v6a2.5 2.5 0 0 1-2.5 2.5H9l-3.5 3v-3H3.5A2.5 2.5 0 0 1 1 9.5v-6Z" />
  </svg>
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ActionBar = ({
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
  selectedFilePath,
  onGitAdd,
  onCopyFileDiff,
}: ActionBarProps) => {
  const [copyLabel, setCopyLabel] = useState("Copy");

  const handleCopyDiff = useCallback(() => {
    if (onCopyFileDiff) {
      onCopyFileDiff();
      setCopyLabel("Copied!");
      setTimeout(() => setCopyLabel("Copy"), 1500);
      return;
    }

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
            setTimeout(() => setCopyLabel("Copy"), 1500);
          })
        ),
        Effect.catchAllCause(() => Effect.void)
      )
    );
  }, [onCopyFileDiff, reviewId]);

  const isApproved = status === "approved";

  const handleRequestChanges = useCallback(() => {
    onStatusChange?.("changes_requested");
  }, [onStatusChange]);

  const handleApprove = useCallback(() => {
    onStatusChange?.("approved");
  }, [onStatusChange]);

  return (
    <header className="flex h-10 items-center border-b border-border-default bg-surface-secondary">
      {/* ── Left: identity & context ─────────────────────────────── */}
      <div className="flex items-center gap-2.5 pl-4 pr-3">
        <span className="text-[13px] font-semibold tracking-[-0.01em] text-text-primary">
          ringi
        </span>
        {status ? <StatusBadge status={status} /> : null}
        {repoName ? (
          <span className="font-mono text-[11px] text-text-tertiary">
            {repoName}
            {branchName ? (
              <span className="text-text-quaternary">:{branchName}</span>
            ) : null}
          </span>
        ) : null}
      </div>

      {/* ── Left separator ───────────────────────────────────────── */}
      <div className="h-4 w-px bg-border-subtle" />

      {/* ── Center: diff display controls ────────────────────────── */}
      <div className="flex flex-1 items-center justify-center gap-2">
        <SegmentedControl diffMode={diffMode} onToggle={onToggleDiffMode} />
      </div>

      {/* ── Right separator ──────────────────────────────────────── */}
      <div className="h-4 w-px bg-border-subtle" />

      {/* ── Right: actions ───────────────────────────────────────── */}
      <div className="flex items-center gap-0.5 px-2">
        {/* Review actions group */}
        {selectedFilePath ? (
          <ToolbarButton onClick={handleCopyDiff} title="Copy file diff">
            {copyLabel}
          </ToolbarButton>
        ) : null}

        {onExport ? (
          <ToolbarButton onClick={onExport} title="Export review feedback">
            Export
          </ToolbarButton>
        ) : null}

        {/* Annotations toggle (review context only) */}
        {onToggleAnnotations ? (
          <ToolbarButton
            onClick={onToggleAnnotations}
            pressed={isAnnotationsOpen}
            title="Toggle annotations"
          >
            <AnnotationsIcon />
            {commentCount !== undefined && commentCount > 0 ? (
              <span className="tabular-nums">{commentCount}</span>
            ) : null}
          </ToolbarButton>
        ) : null}

        {/* Review verdict actions (review context only) */}
        {reviewId ? (
          <>
            <div className="mx-1 h-4 w-px bg-border-subtle" />
            <button
              type="button"
              onClick={handleRequestChanges}
              className={cn(
                "h-7 rounded-md border border-border-default px-2.5 text-[11px] font-medium text-text-secondary transition-[transform,background-color,color,border-color] duration-150",
                motionBase,
                pressScale,
                "hover:border-status-error/30 hover:text-status-error"
              )}
            >
              Request Changes
            </button>
            <button
              type="button"
              disabled={isApproved}
              onClick={handleApprove}
              className={cn(
                "h-7 rounded-md px-2.5 text-[11px] font-medium transition-[transform,background-color,color,box-shadow] duration-200",
                motionBase,
                isApproved
                  ? "cursor-default bg-diff-add-bg text-status-success opacity-70"
                  : `bg-accent-primary text-white hover:bg-accent-primary-hover hover:shadow-sm hover:shadow-accent-primary/20 ${pressScale}`
              )}
            >
              {isApproved ? "Approved" : "Approve"}
            </button>
          </>
        ) : null}

        {/* VCS mutation — visually separated, demoted weight */}
        {selectedFilePath && onGitAdd ? (
          <>
            <div className="mx-1 h-4 w-px bg-border-subtle" />
            <button
              type="button"
              onClick={onGitAdd}
              title={`git add ${selectedFilePath}`}
              className={cn(
                `h-7 rounded-md border border-dashed border-border-default px-2 text-[11px] text-text-tertiary transition-[transform,background-color,color,border-color] duration-150 ${pressScale}`,
                motionBase,
                "hover:border-border-default hover:bg-surface-elevated hover:text-text-secondary"
              )}
            >
              Stage File
            </button>
          </>
        ) : null}

        <div className="mx-0.5 h-4 w-px bg-border-subtle" />
        <AppSettingsControl />
      </div>
    </header>
  );
};
