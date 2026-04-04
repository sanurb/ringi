import { SkeletonBlock } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { ActionBarSkeleton } from "./reviews-list-skeleton";

/**
 * Skeleton for the Changes page (index route).
 *
 * Mirrors the three-column layout:
 * - ActionBar header
 * - FileTree sidebar (w-60)
 * - Diff content area (flex-1)
 */

const STAGGER_DELAY_MS = 40;

function FileTreeItemSkeleton({
  index,
  depth = 0,
}: {
  index: number;
  depth?: number;
}) {
  // Vary widths for visual authenticity
  const widths = ["w-28", "w-36", "w-24", "w-32", "w-20", "w-40", "w-30"];
  const width = widths[index % widths.length];

  return (
    <div
      className="ringi-skeleton-enter flex items-center gap-1.5 py-[3px] pr-2"
      style={{
        paddingLeft: `${depth * 14 + 8}px`,
        animationDelay: `${index * STAGGER_DELAY_MS}ms`,
      }}
    >
      {/* Checkbox */}
      <SkeletonBlock className="size-3 rounded-[3px]" />
      {/* Status letter */}
      <SkeletonBlock className="h-2.5 w-3" />
      {/* File name */}
      <SkeletonBlock className={cn("h-3", width)} />
    </div>
  );
}

function FileTreeSkeleton() {
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border-default bg-surface-secondary">
      {/* Header: scope selector + progress */}
      <div className="flex flex-col gap-1.5 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <SkeletonBlock className="h-7 w-32 rounded-[10px]" />
        </div>
        {/* Progress bar */}
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-[2px] flex-1 rounded-full" />
          <SkeletonBlock className="h-3 w-8" />
        </div>
      </div>

      {/* Separator */}
      <div className="h-px bg-border-subtle" />

      {/* File list */}
      <div className="flex-1 overflow-hidden py-0.5">
        {/* Directory */}
        <div className="flex items-center gap-1 px-3 py-[3px]">
          <SkeletonBlock className="size-3" />
          <SkeletonBlock className="h-3 w-12" />
        </div>
        {/* Files under directory */}
        {Array.from({ length: 6 }, (_, i) => (
          <FileTreeItemSkeleton key={i} index={i} depth={1} />
        ))}
        {/* Another directory */}
        <div className="mt-1 flex items-center gap-1 px-3 py-[3px]">
          <SkeletonBlock className="size-3" />
          <SkeletonBlock className="h-3 w-16" />
        </div>
        {Array.from({ length: 3 }, (_, i) => (
          <FileTreeItemSkeleton key={`b-${i}`} index={i + 6} depth={1} />
        ))}
      </div>

      {/* Footer: diff totals */}
      <div className="flex items-center border-t border-border-subtle px-3 py-1.5">
        <div className="flex gap-1.5">
          <SkeletonBlock className="h-3 w-8" />
          <SkeletonBlock className="h-3 w-8" />
        </div>
      </div>
    </aside>
  );
}

function DiffContentSkeleton() {
  return (
    <div className="flex-1 overflow-hidden bg-surface-primary p-4">
      {/* DiffSummary */}
      <div className="mb-3 flex items-center gap-2">
        <SkeletonBlock className="h-3 w-10" />
        <SkeletonBlock className="h-3 w-10" />
      </div>

      {/* DiffFile header */}
      <div className="rounded-sm border border-border-default bg-surface-elevated">
        {/* File header bar */}
        <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
          <SkeletonBlock className="size-4" />
          <SkeletonBlock className="h-3.5 w-48" />
          <div className="ml-auto flex items-center gap-2">
            <SkeletonBlock className="h-3 w-12" />
            <SkeletonBlock className="h-5 w-16 rounded-sm" />
          </div>
        </div>

        {/* Code lines — staggered for visual rhythm */}
        <div className="p-0">
          {Array.from({ length: 16 }, (_, i) => (
            <DiffLineSkeleton key={i} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

function DiffLineSkeleton({ index }: { index: number }) {
  // Simulate diff line structure: gutter + code
  const codeWidths = [
    "w-3/4",
    "w-1/2",
    "w-5/6",
    "w-2/3",
    "w-1/3",
    "w-4/5",
    "w-1/4",
    "w-3/5",
  ];
  const width = codeWidths[index % codeWidths.length];
  // Occasional "added" or "removed" lines
  const isAdded = index === 3 || index === 4 || index === 10;
  const isRemoved = index === 7 || index === 8;

  return (
    <div
      className={cn(
        "ringi-skeleton-enter flex items-center border-b border-border-subtle/30 px-0 py-0",
        isAdded && "bg-diff-add-bg/20",
        isRemoved && "bg-diff-remove-bg/20"
      )}
      style={{ animationDelay: `${index * 30}ms` }}
    >
      {/* Line numbers */}
      <div className="flex w-16 shrink-0 items-center justify-end gap-1 px-2 py-1.5">
        <SkeletonBlock className="h-2.5 w-5 opacity-40" />
        <SkeletonBlock className="h-2.5 w-5 opacity-40" />
      </div>
      {/* Code content */}
      <div className="flex-1 px-3 py-1.5">
        <SkeletonBlock className={cn("h-3", width)} />
      </div>
    </div>
  );
}

export function ChangesPageSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <ActionBarSkeleton />
      <div className="flex min-h-0 flex-1">
        <FileTreeSkeleton />
        <DiffContentSkeleton />
      </div>
    </div>
  );
}
