interface ReviewListItem {
  id: string;
  status: string;
  sourceType: string;
  createdAt: string;
  repositoryPath: string;
}

interface ReviewListData {
  reviews: ReadonlyArray<ReviewListItem>;
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

import { useMemo } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import * as Effect from "effect/Effect";
import { cn } from "@/lib/utils";
import { serverRuntime } from "../api/$";
import { ReviewService } from "../api/-lib/services/review.service";
import { ActionBar } from "../-shared/layout/action-bar";
import { useKeyboardShortcuts } from "../-shared/hooks/use-keyboard-shortcuts";

const listReviews = createServerFn({ method: "GET" }).handler(async (): Promise<ReviewListData> => {
  const result = await serverRuntime.runPromise(
    Effect.gen(function* () {
      const svc = yield* ReviewService;
      return yield* svc.list({});
    }),
  );
  // JSON roundtrip strips branded/opaque types for serialization
  return JSON.parse(JSON.stringify(result));
});

export const Route = createFileRoute("/reviews/")({
  loader: () => listReviews(),
  component: ReviewsListPage,
});

const statusStyles: Record<string, string> = {
  in_progress: "bg-status-warning/15 text-status-warning",
  approved: "bg-status-success/15 text-status-success",
  changes_requested: "bg-status-error/15 text-status-error",
};

const sourceLabels: Record<string, string> = {
  staged: "Staged",
  branch: "Branch",
  commits: "Commits",
};

function ReviewsListPage() {
  const data = Route.useLoaderData();
  const navigate = useNavigate();

  const shortcuts = useMemo(
    () => [
      { key: "n", description: "New review", handler: () => { window.location.href = "/reviews/new"; } },
      { key: "c", description: "Go to Changes", handler: () => navigate({ to: "/" }) },
    ],
    [navigate],
  );
  useKeyboardShortcuts(shortcuts);

  return (
    <div className="flex h-full flex-col">
      <ActionBar />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-6">
          <div className="mb-5 flex items-center justify-between">
            <h1 className="text-sm font-semibold text-text-primary">Reviews</h1>
            <div className="flex items-center gap-3">
              <span className="text-xs text-text-tertiary">{data.total} total</span>
              <Link
                to="/reviews/new"
                className="rounded-sm bg-accent-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-primary/90"
              >
                New Review
              </Link>
            </div>
          </div>

          {data.reviews.length === 0 ? (
            <div className="rounded-sm border border-border-default bg-surface-elevated p-8 text-center">
              <p className="text-sm text-text-secondary">No reviews yet.</p>
              <p className="mt-1 text-xs text-text-tertiary">
                Stage some changes and create a review.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {data.reviews.map((review) => (
                <ReviewCard key={review.id} review={review} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewCard({ review }: { review: ReviewListItem }) {
  return (
    <Link
      to="/reviews/$reviewId"
      params={{ reviewId: review.id }}
      className="block rounded-sm border border-border-default bg-surface-elevated p-3 transition-colors hover:bg-surface-overlay"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium capitalize",
              statusStyles[review.status] ?? "bg-surface-overlay text-text-tertiary",
            )}
          >
            {review.status.replace("_", " ")}
          </span>
          <span className="text-xs text-text-tertiary">
            {sourceLabels[review.sourceType] ?? review.sourceType}
          </span>
        </div>
        <span className="text-xs text-text-tertiary">
          {new Date(review.createdAt).toLocaleDateString()}
        </span>
      </div>
      <p className="mt-1.5 truncate font-mono text-xs text-text-secondary">
        {review.id.slice(0, 8)} &mdash; {review.repositoryPath.split("/").pop()}
      </p>
    </Link>
  );
}
