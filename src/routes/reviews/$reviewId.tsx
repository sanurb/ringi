import { useState, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import * as Effect from "effect/Effect";
import { serverRuntime } from "../api/$";
import { ReviewService } from "../api/-lib/services/review.service";
import { CommentService } from "../api/-lib/services/comment.service";
import { DiffView } from "../-shared/diff/diff-view";
import { Sidebar } from "../-shared/layout/sidebar";
import { CommentList } from "../-shared/comments/comment-list";
import type { Comment } from "@/api/schemas/comment";
import type { DiffFile as DiffFileType, DiffSummary as DiffSummaryType } from "@/api/schemas/diff";

// ---------------------------------------------------------------------------
// Server function
// ---------------------------------------------------------------------------

interface ReviewFileItem {
  id: string;
  filePath: string;
  oldPath: string;
  status: string;
  additions: number;
  deletions: number;
}

interface ReviewDetailData {
  id: string;
  repositoryPath: string;
  baseRef: string | null;
  sourceType: string;
  sourceRef: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  files: ReadonlyArray<ReviewFileItem>;
  summary: DiffSummaryType;
  repository: string | null;
  comments: ReadonlyArray<Comment>;
  commentStats: { total: number; resolved: number; unresolved: number };
}

const loadReview = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => d as { reviewId: string })
  .handler(async ({ data }): Promise<ReviewDetailData> => {
    const { reviewId } = data;
    const result = await serverRuntime.runPromise(
      Effect.gen(function* () {
        const reviewSvc = yield* ReviewService;
        const commentSvc = yield* CommentService;

        const review = yield* reviewSvc.getById(reviewId as any);
        const comments = yield* commentSvc.getByReview(reviewId as any);
        const commentStats = yield* commentSvc.getStats(reviewId as any);

        return { ...review, comments, commentStats };
      }),
    );
    return JSON.parse(JSON.stringify(result));
  });

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/reviews/$reviewId")({
  loader: ({ params }) => loadReview({ data: { reviewId: params.reviewId } }),
  component: ReviewDetailPage,
  errorComponent: ReviewError,
});

// ---------------------------------------------------------------------------
// Error component
// ---------------------------------------------------------------------------

function ReviewError({ error }: { error: unknown }) {
  const message =
    error instanceof Error ? error.message : "Review not found";
  return (
    <div className="flex h-[calc(100vh-49px)] items-center justify-center">
      <div className="rounded-lg border border-gray-800 bg-surface-elevated p-8 text-center">
        <p className="text-lg font-medium text-red-400">Error</p>
        <p className="mt-2 text-sm text-gray-400">{message}</p>
        <a
          href="/reviews"
          className="mt-4 inline-block text-sm text-accent-cyan hover:underline"
        >
          ← Back to reviews
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const statusColors: Record<string, string> = {
  in_progress: "bg-yellow-500/20 text-yellow-400",
  approved: "bg-green-500/20 text-green-400",
  changes_requested: "bg-red-500/20 text-red-400",
};

async function updateReviewStatus(reviewId: string, status: string) {
  const res = await fetch(`/api/reviews/${reviewId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`Failed to update review: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function ReviewDetailPage() {
  const data = Route.useLoaderData();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [status, setStatus] = useState(data.status);

  const scrollToFile = useCallback((path: string) => {
    setSelectedFile(path);
    const el = document.getElementById(
      `diff-file-${path.replace(/\//g, "-")}`,
    );
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleStatusChange = useCallback(
    async (newStatus: string) => {
      await updateReviewStatus(data.id, newStatus);
      setStatus(newStatus);
    },
    [data.id],
  );

  // Build DiffFile array from metadata (hunks empty — loaded lazily by DiffFile)
  const diffFiles: ReadonlyArray<DiffFileType> = data.files.map((f: ReviewFileItem) => ({
    oldPath: f.oldPath ?? f.filePath,
    newPath: f.filePath,
    status: f.status as DiffFileType["status"],
    additions: f.additions,
    deletions: f.deletions,
    hunks: [],
  }));

  const diffSummary: DiffSummaryType = data.summary;

  // Sidebar metadata
  const sidebarFiles = data.files.map((f: ReviewFileItem) => ({
    oldPath: f.oldPath ?? f.filePath,
    newPath: f.filePath,
    status: f.status as DiffFileType["status"],
    additions: f.additions,
    deletions: f.deletions,
  }));

  // Group comments by file
  const commentsByFile = new Map<string, Comment[]>();
  for (const c of data.comments) {
    const key = c.filePath;
    const arr = commentsByFile.get(key);
    if (arr) arr.push(c as Comment);
    else commentsByFile.set(key, [c as Comment]);
  }

  const repoName = data.repositoryPath.split("/").pop() ?? data.repositoryPath;

  return (
    <div className="flex h-[calc(100vh-49px)] flex-col">
      {/* Review header */}
      <div className="shrink-0 border-b border-gray-800 bg-surface-secondary px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a
              href="/reviews"
              className="text-sm text-gray-500 hover:text-gray-300"
            >
              ← Reviews
            </a>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[status] ?? "bg-gray-500/20 text-gray-400"}`}
            >
              {status.replace(/_/g, " ")}
            </span>
            <span className="font-mono text-sm text-gray-300">{repoName}</span>
            {data.sourceRef && (
              <span className="text-xs text-gray-500">{data.sourceRef}</span>
            )}
            <span className="text-xs text-gray-600">
              {new Date(data.createdAt).toLocaleDateString()}
            </span>
          </div>

          {/* Status actions */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">
              {data.commentStats.total} comments · {data.commentStats.resolved}{" "}
              resolved
            </span>
            {status !== "approved" && (
              <button
                type="button"
                onClick={() => handleStatusChange("approved")}
                className="rounded bg-green-500/20 px-3 py-1.5 text-xs font-medium text-green-400 transition hover:bg-green-500/30"
              >
                Approve
              </button>
            )}
            {status !== "changes_requested" && (
              <button
                type="button"
                onClick={() => handleStatusChange("changes_requested")}
                className="rounded bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/30"
              >
                Request Changes
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex min-h-0 flex-1">
        {/* File sidebar */}
        <Sidebar
          files={sidebarFiles}
          selectedFile={selectedFile}
          onSelectFile={scrollToFile}
        />

        {/* Diff + comments */}
        <div className="flex-1 overflow-y-auto p-6">
          <DiffView files={diffFiles} summary={diffSummary} />

          {/* Comments panel */}
          <div className="mt-8 space-y-6">
            <h2 className="text-lg font-semibold text-gray-100">Comments</h2>

            {data.files.length > 0 ? (
              data.files.map((f: ReviewFileItem) => (
                <div key={f.filePath}>
                  <h3 className="mb-2 font-mono text-sm text-gray-400">
                    {f.filePath}
                  </h3>
                  <CommentList
                    reviewId={data.id}
                    filePath={f.filePath}
                    comments={(commentsByFile.get(f.filePath) ?? []) as Comment[]}
                  />
                </div>
              ))
            ) : (
              <CommentList
                reviewId={data.id}
                filePath=""
                comments={data.comments as Comment[]}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
