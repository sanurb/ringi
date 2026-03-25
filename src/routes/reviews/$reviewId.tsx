import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { useReducer, useCallback, useMemo } from "react";

import { ApiClient } from "@/api/api-client";
import type { Comment } from "@/api/schemas/comment";
import type {
  DiffFile as DiffFileType,
  DiffSummary as DiffSummaryType,
} from "@/api/schemas/diff";
import { ReviewId } from "@/api/schemas/review";
import type { ReviewStatus } from "@/api/schemas/review";
import { ExportFeedbackModal } from "@/components/review/export-feedback-modal";
import { CommentService } from "@/core/services/comment.service";
import { ReviewService } from "@/core/services/review.service";
import { clientRuntime } from "@/lib/client-runtime";

import { DiffSummary } from "../-shared/diff/diff-summary";
import { DiffView } from "../-shared/diff/diff-view";
import { ActionBar } from "../-shared/layout/action-bar";
import { AnnotationsPanel } from "../-shared/layout/annotations-panel";
import { FileTree } from "../-shared/layout/file-tree";
import { serverRuntime } from "../api/$";

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
  files: readonly ReviewFileItem[];
  summary: DiffSummaryType;
  repository: string | null;
  comments: readonly Comment[];
  commentStats: { total: number; resolved: number; unresolved: number };
}

const loadReview = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => {
    const obj = d as Record<string, unknown>;
    if (typeof obj?.reviewId !== "string") {
      throw new TypeError("reviewId required");
    }
    return { reviewId: obj.reviewId };
  })
  .handler(async ({ data }): Promise<ReviewDetailData> => {
    const id = ReviewId.make(data.reviewId);
    const result = await serverRuntime.runPromise(
      Effect.gen(function* result() {
        const reviewSvc = yield* ReviewService;
        const commentSvc = yield* CommentService;

        const review = yield* reviewSvc.getById(id);
        const comments = yield* commentSvc.getByReview(id);
        const commentStats = yield* commentSvc.getStats(id);

        return { ...review, commentStats, comments };
      })
    );
    return JSON.parse(JSON.stringify(result));
  });

// ---------------------------------------------------------------------------
// Error component
// ---------------------------------------------------------------------------

function ReviewError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "Review not found";
  return (
    <div className="flex h-full items-center justify-center">
      <div className="rounded-sm border border-border-default bg-surface-elevated p-8 text-center">
        <p className="text-sm font-medium text-status-error">Error</p>
        <p className="mt-2 text-xs text-text-secondary">{message}</p>
        <a
          href="/reviews"
          className="mt-4 inline-block text-xs text-text-link hover:underline"
        >
          &larr; Back to reviews
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Client-side Effects
// ---------------------------------------------------------------------------

const updateStatus = (reviewId: string, status: string) =>
  Effect.gen(function* updateReviewStatus() {
    const { http } = yield* ApiClient;
    return yield* http.reviews.update({
      path: { id: ReviewId.make(reviewId) },
      payload: { status: Option.some(status as ReviewStatus) },
    });
  });

// ---------------------------------------------------------------------------
// Review detail reducer — groups related UI state
// ---------------------------------------------------------------------------

interface ReviewDetailState {
  status: string;
  diffMode: "split" | "unified";
  annotationsOpen: boolean;
  exportOpen: boolean;
  selectedFile: string | null;
  viewedFiles: ReadonlySet<string>;
}

type ReviewDetailAction =
  | { type: "SET_STATUS"; status: string }
  | { type: "TOGGLE_DIFF_MODE" }
  | { type: "TOGGLE_ANNOTATIONS" }
  | { type: "SET_EXPORT_OPEN"; open: boolean }
  | { type: "SELECT_FILE"; path: string }
  | { type: "TOGGLE_VIEWED"; filePath: string };

const reviewDetailReducer = (
  state: ReviewDetailState,
  action: ReviewDetailAction
): ReviewDetailState => {
  switch (action.type) {
    case "SET_STATUS": {
      return { ...state, status: action.status };
    }
    case "TOGGLE_DIFF_MODE": {
      return {
        ...state,
        diffMode: state.diffMode === "split" ? "unified" : "split",
      };
    }
    case "TOGGLE_ANNOTATIONS": {
      return { ...state, annotationsOpen: !state.annotationsOpen };
    }
    case "SET_EXPORT_OPEN": {
      return { ...state, exportOpen: action.open };
    }
    case "SELECT_FILE": {
      return { ...state, selectedFile: action.path };
    }
    case "TOGGLE_VIEWED": {
      const next = new Set(state.viewedFiles);
      if (next.has(action.filePath)) {
        next.delete(action.filePath);
      } else {
        next.add(action.filePath);
      }
      return { ...state, viewedFiles: next };
    }
    default: {
      return state;
    }
  }
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const ReviewDetailPage = () => {
  const data = Route.useLoaderData();

  // Build DiffFile array from metadata (hunks empty — loaded lazily by DiffFile)
  const diffFiles: readonly DiffFileType[] = useMemo(
    () =>
      data.files.map((f: ReviewFileItem) => ({
        additions: f.additions,
        deletions: f.deletions,
        hunks: [],
        newPath: f.filePath,
        oldPath: f.oldPath ?? f.filePath,
        status: f.status as DiffFileType["status"],
      })),
    [data.files]
  );

  const [state, dispatch] = useReducer(reviewDetailReducer, {
    annotationsOpen: true,
    diffMode: "split",
    exportOpen: false,
    selectedFile: diffFiles[0]?.newPath ?? null,
    status: data.status,
    viewedFiles: new Set<string>(),
  });

  const selectedFileData = useMemo(
    () => diffFiles.find((f) => f.newPath === state.selectedFile) ?? null,
    [diffFiles, state.selectedFile]
  );

  const handleSelectFile = useCallback((path: string) => {
    dispatch({ path, type: "SELECT_FILE" });
  }, []);

  const handleToggleViewed = useCallback((filePath: string) => {
    dispatch({ filePath, type: "TOGGLE_VIEWED" });
  }, []);

  const handleStatusChange = useCallback(
    (newStatus: string) => {
      clientRuntime.runFork(
        updateStatus(data.id, newStatus).pipe(
          Effect.tap(() =>
            Effect.sync(() =>
              dispatch({ status: newStatus, type: "SET_STATUS" })
            )
          ),
          Effect.tapErrorCause((cause) =>
            Effect.logError("Failed to update review status", cause)
          )
        )
      );
    },
    [data.id]
  );

  const toggleDiffMode = useCallback(() => {
    dispatch({ type: "TOGGLE_DIFF_MODE" });
  }, []);

  const toggleAnnotations = useCallback(() => {
    dispatch({ type: "TOGGLE_ANNOTATIONS" });
  }, []);

  const handleExport = useCallback(() => {
    dispatch({ open: true, type: "SET_EXPORT_OPEN" });
  }, []);

  const handleExportOpenChange = useCallback((open: boolean) => {
    dispatch({ open, type: "SET_EXPORT_OPEN" });
  }, []);

  const diffSummary: DiffSummaryType = data.summary;
  const repoName = data.repositoryPath.split("/").pop() ?? data.repositoryPath;

  return (
    <div className="flex h-full flex-col">
      <ActionBar
        repoName={repoName}
        reviewId={data.id}
        status={state.status}
        onStatusChange={handleStatusChange}
        diffMode={state.diffMode}
        onToggleDiffMode={toggleDiffMode}
        commentCount={data.commentStats.total}
        isAnnotationsOpen={state.annotationsOpen}
        onToggleAnnotations={toggleAnnotations}
        onExport={handleExport}
      />

      <div className="flex min-h-0 flex-1">
        <FileTree
          files={diffFiles}
          selectedFile={state.selectedFile}
          onSelectFile={handleSelectFile}
          reviewedFiles={state.viewedFiles}
          onToggleViewed={handleToggleViewed}
        />

        <div className="flex-1 overflow-y-auto bg-surface-primary p-4">
          {selectedFileData ? (
            <div className="space-y-3">
              <DiffSummary summary={diffSummary} />
              <DiffView
                file={selectedFileData}
                reviewId={data.id}
                diffMode={state.diffMode}
                comments={data.comments}
                viewed={
                  state.selectedFile
                    ? state.viewedFiles.has(state.selectedFile)
                    : false
                }
                onToggleViewed={handleToggleViewed}
              />
            </div>
          ) : (
            <div className="rounded-sm border border-border-default bg-surface-elevated p-8 text-center">
              <p className="text-sm text-text-tertiary">
                Select a file to view its diff.
              </p>
            </div>
          )}
        </div>

        <AnnotationsPanel
          comments={data.comments}
          selectedFile={state.selectedFile}
          reviewId={data.id}
          isOpen={state.annotationsOpen}
        />
      </div>

      <ExportFeedbackModal
        open={state.exportOpen}
        onOpenChange={handleExportOpenChange}
        comments={data.comments}
        reviewId={data.id}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/reviews/$reviewId")({
  component: ReviewDetailPage,
  errorComponent: ReviewError,
  loader: ({ params }) => loadReview({ data: { reviewId: params.reviewId } }),
});
