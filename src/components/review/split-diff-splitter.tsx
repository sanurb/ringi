import type { JSX, ReactNode } from "react";

import { useSplitDiffResizer } from "@/hooks/use-split-diff-resizer";
import { cn } from "@/lib/utils";

/**
 * Wraps a PatchDiff (split mode) and overlays a draggable vertical splitter.
 *
 * Architecture:
 * - The wrapper div receives a ref that discovers the `<diffs-container>`
 *   shadow DOM and injects a CSS override so the split grid columns read
 *   `--ringi-split-left` / `--ringi-split-right` CSS variables.
 * - The splitter handle is absolutely positioned at the split point.
 * - During drag, DOM updates happen via direct style manipulation (no React
 *   re-renders), then the final ratio is committed to state + localStorage.
 * - Keyboard: Arrow keys adjust ratio, Enter/Space resets to 50%.
 */
export const SplitDiffSplitter = ({
  children,
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}): JSX.Element | ReactNode => {
  const { ratio, isDragging, wrapperRef, splitterProps } =
    useSplitDiffResizer(enabled);

  if (!enabled) {
    return children;
  }

  return (
    <div
      ref={wrapperRef}
      className="ringi-split-diff-wrapper relative"
      style={
        {
          "--ringi-splitter-left": `${ratio * 100}%`,
        } as React.CSSProperties
      }
    >
      {children}

      {/* ── Draggable splitter handle ─────────────────────────── */}
      <div
        {...splitterProps}
        className={cn(
          "ringi-split-splitter group/splitter",
          "absolute top-0 bottom-0 z-10",
          "-translate-x-1/2",
          "flex items-center justify-center",
          "cursor-col-resize",
          "outline-none",
          isDragging && "ringi-split-splitter--active"
        )}
        style={{
          left: "var(--ringi-splitter-left)",
          width: "13px",
        }}
      >
        {/* Visible bar */}
        <div
          className={cn(
            "ringi-split-splitter__bar",
            "h-full transition-[width,background-color,opacity] duration-100",
            "[transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
            isDragging
              ? "w-[3px] bg-accent-primary/60"
              : "w-px bg-border-default group-hover/splitter:w-[2px] group-hover/splitter:bg-accent-primary/30"
          )}
        />

        {/* Center grip dots — visible on hover/focus/active */}
        <div
          className={cn(
            "ringi-split-splitter__grip",
            "pointer-events-none absolute",
            "flex flex-col items-center gap-[3px]",
            "transition-opacity duration-100",
            "[transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
            isDragging
              ? "opacity-100"
              : "opacity-0 group-hover/splitter:opacity-70 group-focus-visible/splitter:opacity-70"
          )}
        >
          <div className="h-[3px] w-[3px] rounded-full bg-accent-primary/70" />
          <div className="h-[3px] w-[3px] rounded-full bg-accent-primary/70" />
          <div className="h-[3px] w-[3px] rounded-full bg-accent-primary/70" />
        </div>
      </div>
    </div>
  );
};
