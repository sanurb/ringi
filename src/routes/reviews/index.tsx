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
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import * as Effect from "effect/Effect";
import { serverRuntime } from "../api/$";
import { ReviewService } from "../api/-lib/services/review.service";

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
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-100">Reviews</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{data.total} total</span>
          <a
            href="/reviews/new"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
          >
            New Review
          </a>
        </div>
      </div>

      {data.reviews.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-surface-elevated p-8 text-center">
          <p className="text-gray-400">No reviews yet.</p>
          <p className="mt-1 text-sm text-gray-500">Stage some changes and create a review.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.reviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewCard({ review }: { review: ReviewListItem }) {
  const statusColors: Record<string, string> = {
    in_progress: "bg-yellow-500/20 text-yellow-400",
    approved: "bg-green-500/20 text-green-400",
    changes_requested: "bg-red-500/20 text-red-400",
  };

  const sourceLabels: Record<string, string> = {
    staged: "Staged",
    branch: "Branch",
    commits: "Commits",
  };

  return (
    <a
      href={`/reviews/${review.id}`}
      className="block rounded-lg border border-gray-800 bg-surface-elevated p-4 transition hover:border-gray-700 hover:bg-surface-card"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[review.status] ?? "bg-gray-500/20 text-gray-400"}`}
          >
            {review.status.replace("_", " ")}
          </span>
          <span className="text-xs text-gray-500">
            {sourceLabels[review.sourceType] ?? review.sourceType}
          </span>
        </div>
        <span className="text-xs text-gray-600">
          {new Date(review.createdAt).toLocaleDateString()}
        </span>
      </div>
      <p className="mt-2 truncate text-sm text-gray-300">
        {review.id.slice(0, 8)}... — {review.repositoryPath.split("/").pop()}
      </p>
    </a>
  );
}
