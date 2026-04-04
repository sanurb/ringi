import { SkeletonBlock } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Skeleton for the reviews list page.
 *
 * Mirrors the exact layout of `ReviewsListPage`:
 * - ActionBar (slim header)
 * - Centered content area with title + "New Review" button
 * - 5 review cards with staggered fade-in
 */

const STAGGER_DELAY_MS = 50;

function ReviewCardSkeleton({ index }: { index: number }) {
  return (
    <div
      className={cn(
        "ringi-skeleton-enter rounded-sm border border-border-default bg-surface-elevated p-3"
      )}
      style={{ animationDelay: `${index * STAGGER_DELAY_MS}ms` }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Status badge */}
          <SkeletonBlock className="h-5 w-16 rounded-full" />
          {/* Source type */}
          <SkeletonBlock className="h-3 w-10" />
        </div>
        {/* Date */}
        <SkeletonBlock className="h-3 w-16" />
      </div>
      {/* ID + repo path */}
      <SkeletonBlock className="mt-2 h-3 w-48" />
    </div>
  );
}

export function ReviewsListSkeleton() {
  return (
    <div className="flex h-full flex-col">
      {/* ActionBar skeleton */}
      <ActionBarSkeleton />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-6">
          {/* Header row */}
          <div className="mb-5 flex items-center justify-between">
            <SkeletonBlock className="h-4 w-16" />
            <SkeletonBlock className="h-7 w-24 rounded-sm" />
          </div>

          {/* Review cards */}
          <div className="space-y-1">
            {Array.from({ length: 5 }, (_, i) => (
              <ReviewCardSkeleton key={i} index={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Slim ActionBar skeleton — reusable across routes.
 * Matches the 36px (h-9) header with breadcrumb + segmented control.
 */
export function ActionBarSkeleton() {
  return (
    <header className="flex h-9 shrink-0 items-center border-b border-border-subtle bg-surface-secondary/50">
      {/* Left: breadcrumb dots */}
      <div className="flex items-center gap-1.5 pl-3 pr-4">
        <SkeletonBlock className="h-3 w-8" />
        <span className="text-[10px] text-text-tertiary/30 select-none">·</span>
        <SkeletonBlock className="h-3 w-16" />
      </div>

      {/* Center: segmented control */}
      <div className="flex flex-1 items-center justify-center">
        <SkeletonBlock className="h-6 w-28 rounded-[5px]" />
      </div>

      {/* Right: action buttons */}
      <div className="flex items-center gap-1.5 pr-2.5">
        <SkeletonBlock className="h-6 w-6 rounded-[5px]" />
        <SkeletonBlock className="h-6 w-6 rounded-[5px]" />
      </div>
    </header>
  );
}
