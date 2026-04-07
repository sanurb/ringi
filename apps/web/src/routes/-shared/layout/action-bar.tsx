import type { ReviewId } from "@ringi/core/schemas/review";
import * as Effect from "effect/Effect";
import { EllipsisIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiClient } from "@/api/api-client";
import { AppSettingsControl } from "@/components/settings/app-settings-control";
import { clientRuntime } from "@/lib/client-runtime";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// System tokens — single source of truth for the header's visual language
// ---------------------------------------------------------------------------

const EASE_OUT = "[transition-timing-function:cubic-bezier(0.23,1,0.32,1)]";
const motionBase = `${EASE_OUT} motion-reduce:transform-none`;
const pressScale = "active:scale-[0.97]";

const CONTROL = {
  height: "h-6",
  radius: "rounded-[5px]",
  text: "text-[11px]",
} as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ActionBarProps {
  repoName?: string;
  branchName?: string;

  // ── Review context ───────────────────────────────────────────────
  reviewId?: string;
  status?: string;
  onStatusChange?: (status: string) => void;

  // ── Scope / source ───────────────────────────────────────────────
  scopeLabel?: string;
  sourceDescription?: string;

  // ── View mode ────────────────────────────────────────────────────
  diffMode?: "split" | "unified";
  onToggleDiffMode?: () => void;

  // ── Review progress ──────────────────────────────────────────────
  /** Files marked as reviewed by the user. */
  reviewedFileCount?: number;
  /** Total number of files in the diff. */
  totalFileCount?: number;

  // ── Annotations ──────────────────────────────────────────────────
  unresolvedCount?: number;
  isAnnotationsOpen?: boolean;
  onToggleAnnotations?: () => void;

  // ── Utilities ────────────────────────────────────────────────────
  onExport?: () => void;
  onCopyDiff?: () => void;

  /** e.g. "12/18 hunks reviewed" */
  coverageLabel?: string;
}

// ---------------------------------------------------------------------------
// Segmented control
// ---------------------------------------------------------------------------

const SegmentedControl = ({
  diffMode,
  onToggle,
}: {
  diffMode: "split" | "unified";
  onToggle?: () => void;
}) => (
  <div
    role="radiogroup"
    aria-label="Diff view mode"
    className={cn(
      "relative grid grid-cols-2 items-center bg-surface-inset p-0.5",
      CONTROL.radius
    )}
  >
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] bg-surface-elevated shadow-[0_1px_2px_rgb(0_0_0/0.06)] transition-transform duration-200",
        CONTROL.radius,
        EASE_OUT,
        "motion-reduce:transition-none",
        diffMode === "unified" && "translate-x-full"
      )}
    />
    {(["split", "unified"] as const).map((mode) => (
      <button
        key={mode}
        type="button"
        role="radio"
        aria-checked={diffMode === mode}
        onClick={onToggle}
        className={cn(
          "relative z-10 px-2 py-0.5 capitalize transition-colors duration-100",
          CONTROL.radius,
          CONTROL.text,
          pressScale,
          motionBase,
          diffMode === mode
            ? "font-medium text-text-primary"
            : "text-text-tertiary hover:text-text-secondary"
        )}
      >
        {mode}
      </button>
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// Overflow menu — keyboard-navigable, Escape-closable
// ---------------------------------------------------------------------------

const OverflowMenu = ({
  items,
}: {
  items: readonly {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  }[];
}) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const buttons = menuRef.current?.querySelectorAll<HTMLButtonElement>(
          'button[role="menuitem"]:not(:disabled)'
        );
        if (!buttons?.length) return;
        const focused = document.activeElement as HTMLElement;
        const idx = Array.from(buttons).indexOf(focused as HTMLButtonElement);
        const next =
          e.key === "ArrowDown"
            ? buttons[(idx + 1) % buttons.length]
            : buttons[(idx - 1 + buttons.length) % buttons.length];
        next?.focus();
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      menuRef.current
        ?.querySelector<HTMLButtonElement>(
          'button[role="menuitem"]:not(:disabled)'
        )
        ?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !menuRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "inline-flex items-center justify-center transition-[transform,background-color,color] duration-100",
          CONTROL.height,
          "w-6",
          CONTROL.radius,
          pressScale,
          motionBase,
          open
            ? "bg-surface-elevated text-text-secondary"
            : "text-text-tertiary hover:bg-surface-elevated hover:text-text-secondary"
        )}
      >
        <EllipsisIcon aria-hidden className="size-3.5" />
        <span className="sr-only">More actions</span>
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-[128px] overflow-hidden rounded-md border border-border-default bg-surface-elevated py-0.5 shadow-lg shadow-black/8"
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              type="button"
              disabled={item.disabled}
              onClick={() => {
                item.onClick();
                close();
              }}
              className={cn(
                "flex w-full items-center px-2.5 py-1 text-left text-[11px] text-text-secondary transition-colors duration-75",
                item.disabled
                  ? "cursor-default opacity-40"
                  : "hover:bg-surface-overlay hover:text-text-primary"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Review state map
// ---------------------------------------------------------------------------

const REVIEW_STATE_MAP: Record<string, { label: string; className: string }> = {
  approved: { label: "Approved", className: "text-status-success/80" },
  changes_requested: {
    label: "Changes requested",
    className: "text-status-error/80",
  },
  in_progress: { label: "In review", className: "text-text-tertiary" },
};

// ---------------------------------------------------------------------------
// Breadcrumb separator — a dim dot, not a slash
// ---------------------------------------------------------------------------

const Dot = () => (
  <span
    aria-hidden
    className="shrink-0 text-[10px] text-text-tertiary/30 select-none"
  >
    ·
  </span>
);

// ---------------------------------------------------------------------------
// ActionBar
// ---------------------------------------------------------------------------

export const ActionBar = ({
  repoName,
  branchName,
  reviewId,
  status,
  onStatusChange,
  scopeLabel,
  sourceDescription,
  diffMode = "split",
  onToggleDiffMode,
  reviewedFileCount,
  totalFileCount,
  unresolvedCount,
  isAnnotationsOpen = false,
  onToggleAnnotations,
  onExport,
  onCopyDiff,
  coverageLabel,
}: ActionBarProps) => {
  // ── Copy feedback ───────────────────────────────────────────
  const [copyFeedback, setCopyFeedback] = useState(false);

  const handleCopy = useCallback(() => {
    if (onCopyDiff) {
      onCopyDiff();
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1400);
      return;
    }
    if (!reviewId) return;
    clientRuntime.runFork(
      Effect.gen(function* copyReviewDiff() {
        const { http } = yield* ApiClient;
        return yield* http.export.markdown({
          path: { id: reviewId as ReviewId },
        });
      }).pipe(
        Effect.tap((md) =>
          Effect.promise(() => navigator.clipboard.writeText(md))
        ),
        Effect.tap(() =>
          Effect.sync(() => {
            setCopyFeedback(true);
            setTimeout(() => setCopyFeedback(false), 1400);
          })
        ),
        Effect.catchCause(() => Effect.void)
      )
    );
  }, [onCopyDiff, reviewId]);

  const isApproved = status === "approved";

  const handleRequestChanges = useCallback(() => {
    onStatusChange?.("changes_requested");
  }, [onStatusChange]);

  const handleApprove = useCallback(() => {
    onStatusChange?.("approved");
  }, [onStatusChange]);

  // ── Overflow items ──────────────────────────────────────────
  const overflowItems = [
    ...(onCopyDiff || reviewId
      ? [
          {
            label: copyFeedback ? "Copied" : "Copy diff",
            onClick: handleCopy,
            disabled: copyFeedback,
          },
        ]
      : []),
    ...(onExport ? [{ label: "Export feedback", onClick: onExport }] : []),
  ];

  // ── Derived state ──────────────────────────────────────────
  const contextDescription = sourceDescription ?? scopeLabel;
  const reviewState = status ? REVIEW_STATE_MAP[status] : undefined;
  const hasUnresolved = unresolvedCount !== undefined && unresolvedCount > 0;

  // Right-side progress: "4/13 reviewed" or "3 unresolved" or "Approved"
  const hasProgress =
    reviewedFileCount !== undefined &&
    totalFileCount !== undefined &&
    totalFileCount > 0;

  const primaryActionLabel = isApproved
    ? "Approved"
    : hasUnresolved
      ? "Complete review"
      : "Approve";

  return (
    <header
      className="flex h-9 shrink-0 items-center border-b border-border-subtle bg-surface-secondary/50"
      role="banner"
    >
      {/* ── Left: product / repo / scope ─────────────────────── */}
      <div className="flex min-w-0 items-center gap-1.5 pl-3 pr-4">
        <span className="shrink-0 text-[11px] font-medium text-text-tertiary/60 select-none">
          Ringi
        </span>

        {repoName ? (
          <>
            <Dot />
            <span className="shrink-0 font-mono text-[11px] font-medium text-text-secondary">
              {repoName}
            </span>
          </>
        ) : null}

        {contextDescription ? (
          <>
            <Dot />
            <span className="truncate text-[11px] text-text-tertiary">
              {contextDescription}
            </span>
          </>
        ) : branchName ? (
          <>
            <Dot />
            <span className="truncate font-mono text-[11px] text-text-tertiary/70">
              {branchName}
            </span>
          </>
        ) : null}
      </div>

      {/* ── Center: view mode ────────────────────────────────── */}
      <div className="flex flex-1 items-center justify-center">
        <SegmentedControl diffMode={diffMode} onToggle={onToggleDiffMode} />
      </div>

      {/* ── Right: review state / progress / action ──────────── */}
      <div className="flex shrink-0 items-center gap-1.5 pr-2.5">
        {/* Coverage summary */}
        {coverageLabel ? (
          <span className="text-[11px] tabular-nums text-text-tertiary">
            {coverageLabel}
          </span>
        ) : null}

        {/* Review progress: "4/13 reviewed" */}
        {hasProgress ? (
          <span
            className={cn(
              "text-[11px] tabular-nums",
              reviewedFileCount === totalFileCount
                ? "text-status-success/70"
                : "text-text-tertiary"
            )}
          >
            {reviewedFileCount}/{totalFileCount}
          </span>
        ) : null}

        {/* Unresolved count or review state */}
        {hasUnresolved ? (
          <span className="text-[11px] tabular-nums text-status-warning/80">
            {unresolvedCount} unresolved
          </span>
        ) : reviewId && reviewState && !hasProgress ? (
          <span className={cn("text-[11px]", reviewState.className)}>
            {reviewState.label}
          </span>
        ) : null}

        {/* Annotations toggle */}
        {onToggleAnnotations ? (
          <button
            type="button"
            onClick={onToggleAnnotations}
            aria-pressed={isAnnotationsOpen}
            aria-label={
              hasUnresolved
                ? `${unresolvedCount} unresolved annotations`
                : "Toggle annotations"
            }
            className={cn(
              "inline-flex items-center gap-1 px-1.5 transition-[transform,background-color,color] duration-100",
              CONTROL.height,
              CONTROL.radius,
              CONTROL.text,
              pressScale,
              motionBase,
              isAnnotationsOpen
                ? "bg-accent-muted/50 font-medium text-accent-primary"
                : "text-text-tertiary hover:bg-surface-elevated hover:text-text-secondary"
            )}
          >
            <svg
              aria-hidden
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="size-3"
            >
              <path
                d="M2.5 3.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H9l-3 2.5V10.5H3.5a1 1 0 0 1-1-1v-6Z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {hasUnresolved ? (
              <span className="tabular-nums">{unresolvedCount}</span>
            ) : null}
          </button>
        ) : null}

        {/* Review verdict */}
        {reviewId && onStatusChange ? (
          <>
            {!isApproved ? (
              <button
                type="button"
                onClick={handleRequestChanges}
                className={cn(
                  "font-medium transition-[transform,color] duration-100",
                  CONTROL.height,
                  CONTROL.radius,
                  CONTROL.text,
                  pressScale,
                  motionBase,
                  "px-2 text-text-tertiary hover:text-status-error"
                )}
              >
                Request changes
              </button>
            ) : null}
            <button
              type="button"
              disabled={isApproved}
              onClick={handleApprove}
              className={cn(
                "font-medium transition-[transform,background-color,color] duration-150",
                CONTROL.height,
                CONTROL.radius,
                CONTROL.text,
                motionBase,
                isApproved
                  ? "cursor-default bg-status-success/8 px-2 text-status-success/60"
                  : `bg-accent-primary px-2.5 text-white hover:bg-accent-primary-hover ${pressScale}`
              )}
            >
              {primaryActionLabel}
            </button>
          </>
        ) : null}

        <OverflowMenu items={overflowItems} />
        <AppSettingsControl />
      </div>
    </header>
  );
};
