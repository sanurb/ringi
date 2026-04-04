import { SkeletonBlock } from "@/components/ui/skeleton";

import { ActionBarSkeleton } from "./reviews-list-skeleton";

/**
 * Skeleton for the New Review page (`/reviews/new`).
 *
 * Mirrors: ActionBar + centered form with repo info + staged changes + create button.
 */
export function NewReviewSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <ActionBarSkeleton />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl px-6 py-6">
          {/* Back link */}
          <div className="mb-5">
            <SkeletonBlock className="h-3 w-24" />
          </div>

          {/* Title */}
          <SkeletonBlock className="mb-5 h-4 w-24" />

          {/* Repository info card */}
          <div className="mb-4 rounded-sm border border-border-default bg-surface-elevated p-3">
            <SkeletonBlock className="mb-2 h-3 w-16" />
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <SkeletonBlock className="h-3 w-10" />
                <SkeletonBlock className="h-3 w-20" />
              </div>
              <div className="flex justify-between">
                <SkeletonBlock className="h-3 w-12" />
                <SkeletonBlock className="h-3 w-16" />
              </div>
            </div>
          </div>

          {/* Staged changes card */}
          <div className="mb-4 rounded-sm border border-border-default bg-surface-elevated p-3">
            <SkeletonBlock className="mb-2 h-3 w-24" />
            <div className="flex gap-4">
              <div className="flex items-baseline gap-1">
                <SkeletonBlock className="h-6 w-6" />
                <SkeletonBlock className="h-3 w-8" />
              </div>
              <SkeletonBlock className="h-6 w-8" />
              <SkeletonBlock className="h-6 w-8" />
            </div>
          </div>

          {/* Create button */}
          <SkeletonBlock className="h-10 w-full rounded-sm" />
        </div>
      </div>
    </div>
  );
}
