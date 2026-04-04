"use client";

import {
  Skeleton as BoneyardSkeleton,
  configureBoneyard,
} from "boneyard-js/react";
import type { SkeletonProps as BoneyardSkeletonProps } from "boneyard-js/react";

// ── Global config: Ringi design tokens ──────────────────────────────────────
// Colors align with --ringi-surface-overlay / --ringi-border-subtle
configureBoneyard({
  color: "rgba(0, 0, 0, 0.06)",
  darkColor: "rgba(255, 255, 255, 0.06)",
  animate: true,
});

export type { BoneyardSkeletonProps as SkeletonProps };
export { BoneyardSkeleton as Skeleton };

// ── Manual skeleton primitives ──────────────────────────────────────────────
// For inline use where boneyard's full DOM-snapshot approach is overkill
// (e.g. single lines of text, small badges, isolated elements).

import { cn } from "@/lib/utils";

/**
 * Lightweight animated skeleton block — a single pulsing rectangle.
 *
 * Uses the same easing and timing as Ringi's motion system:
 * - `ease-out` cubic-bezier(0.23, 1, 0.32, 1) for the pulse
 * - Respects `prefers-reduced-motion` (opacity-only, no transform)
 * - Auto dark-mode via Ringi surface tokens
 *
 * ```tsx
 * <SkeletonBlock className="h-4 w-32" />          // text line
 * <SkeletonBlock className="h-4 w-4 rounded-full" /> // avatar
 * ```
 */
export function SkeletonBlock({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "animate-skeleton-pulse rounded-[4px] bg-surface-overlay/60",
        className
      )}
      {...props}
    />
  );
}
