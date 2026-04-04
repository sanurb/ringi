import { SkeletonBlock } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Skeleton for the Review Detail page (`/reviews/$reviewId`).
 *
 * Same three-column layout as ChangesPage but with:
 * - Review-specific ActionBar (status, verdict buttons)
 * - Annotations panel on the right
 */

const STAGGER_DELAY_MS = 40;

function ReviewActionBarSkeleton() {
  return (
    <header className="flex h-9 shrink-0 items-center border-b border-border-subtle bg-surface-secondary/50">
      {/* Left: breadcrumb */}
      <div className="flex items-center gap-1.5 pl-3 pr-4">
        <SkeletonBlock className="h-3 w-8" />
        <span className="text-[10px] text-text-tertiary/30 select-none">·</span>
        <SkeletonBlock className="h-3 w-20" />
        <span className="text-[10px] text-text-tertiary/30 select-none">·</span>
        <SkeletonBlock className="h-3 w-28" />
      </div>

      {/* Center: segmented control */}
      <div className="flex flex-1 items-center justify-center">
        <SkeletonBlock className="h-6 w-28 rounded-[5px]" />
      </div>

      {/* Right: progress + annotations + verdict */}
      <div className="flex items-center gap-1.5 pr-2.5">
        <SkeletonBlock className="h-3 w-10" />
        <SkeletonBlock className="h-6 w-8 rounded-[5px]" />
        <SkeletonBlock className="h-6 w-24 rounded-[5px]" />
        <SkeletonBlock className="h-6 w-16 rounded-[5px]" />
      </div>
    </header>
  );
}

function FileTreeSkeleton() {
  const widths = ["w-28", "w-36", "w-24", "w-32", "w-20"];

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border-default bg-surface-secondary">
      <div className="flex flex-col gap-1.5 px-3 py-2">
        <SkeletonBlock className="h-4 w-24" />
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-[2px] flex-1 rounded-full" />
          <SkeletonBlock className="h-3 w-8" />
        </div>
      </div>

      <div className="h-px bg-border-subtle" />

      <div className="flex-1 overflow-hidden py-0.5">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="ringi-skeleton-enter flex items-center gap-1.5 py-[3px] pr-2"
            style={{
              paddingLeft: `${1 * 14 + 8}px`,
              animationDelay: `${i * STAGGER_DELAY_MS}ms`,
            }}
          >
            <SkeletonBlock className="size-3 rounded-[3px]" />
            <SkeletonBlock className="h-2.5 w-3" />
            <SkeletonBlock className={cn("h-3", widths[i % widths.length])} />
          </div>
        ))}
      </div>

      <div className="flex items-center border-t border-border-subtle px-3 py-1.5">
        <div className="flex gap-1.5">
          <SkeletonBlock className="h-3 w-8" />
          <SkeletonBlock className="h-3 w-8" />
        </div>
      </div>
    </aside>
  );
}

function AnnotationsPanelSkeleton() {
  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-border-default bg-surface-secondary">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
        <SkeletonBlock className="h-3.5 w-24" />
        <SkeletonBlock className="h-5 w-5 rounded-[5px]" />
      </div>

      {/* Comment cards */}
      <div className="flex-1 overflow-hidden p-2 space-y-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="ringi-skeleton-enter rounded-sm border border-border-default bg-surface-elevated p-2.5"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <SkeletonBlock className="h-3 w-16" />
              <SkeletonBlock className="h-3 w-8" />
            </div>
            <SkeletonBlock className="h-3 w-full mb-1" />
            <SkeletonBlock className="h-3 w-3/4" />
          </div>
        ))}
      </div>
    </aside>
  );
}

function DiffContentSkeleton() {
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

  return (
    <div className="flex-1 overflow-hidden bg-surface-primary p-4">
      <div className="mb-3 flex items-center gap-2">
        <SkeletonBlock className="h-3 w-10" />
        <SkeletonBlock className="h-3 w-10" />
      </div>

      <div className="rounded-sm border border-border-default bg-surface-elevated">
        <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
          <SkeletonBlock className="size-4" />
          <SkeletonBlock className="h-3.5 w-48" />
          <div className="ml-auto flex items-center gap-2">
            <SkeletonBlock className="h-3 w-12" />
            <SkeletonBlock className="h-5 w-16 rounded-sm" />
          </div>
        </div>

        {Array.from({ length: 14 }, (_, i) => {
          const isAdded = i === 3 || i === 4;
          const isRemoved = i === 7;
          return (
            <div
              key={i}
              className={cn(
                "ringi-skeleton-enter flex items-center border-b border-border-subtle/30",
                isAdded && "bg-diff-add-bg/20",
                isRemoved && "bg-diff-remove-bg/20"
              )}
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <div className="flex w-16 shrink-0 items-center justify-end gap-1 px-2 py-1.5">
                <SkeletonBlock className="h-2.5 w-5 opacity-40" />
                <SkeletonBlock className="h-2.5 w-5 opacity-40" />
              </div>
              <div className="flex-1 px-3 py-1.5">
                <SkeletonBlock
                  className={cn("h-3", codeWidths[i % codeWidths.length])}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ReviewDetailSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <ReviewActionBarSkeleton />
      <div className="flex min-h-0 flex-1">
        <FileTreeSkeleton />
        <DiffContentSkeleton />
        <AnnotationsPanelSkeleton />
      </div>
    </div>
  );
}
