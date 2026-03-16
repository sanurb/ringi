import { useReducer, useEffect, useCallback, useMemo, useRef } from "react";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { cn } from "@/lib/utils";
import { clientRuntime } from "@/lib/client-runtime";
import { ApiClient } from "@/api/api-client";
import type { ReviewId } from "@/api/schemas/review";
import type {
  DiffFile as DiffFileType,
  DiffHunk as DiffHunkType,
  DiffLine as DiffLineType,
  DiffStatus,
} from "@/api/schemas/diff";
import { DiffHunk } from "./diff-hunk";
import { type CommentLineKey, makeCommentLineKey } from "./diff-line";
import { useSyntaxHighlight, detectLanguage } from "./use-syntax-highlight";
const statusBadge: Record<DiffStatus, { label: string; className: string }> = {
  added: { label: "A", className: "bg-status-success/15 text-status-success" },
  modified: { label: "M", className: "bg-status-warning/15 text-status-warning" },
  deleted: { label: "D", className: "bg-status-error/15 text-status-error" },
  renamed: { label: "R", className: "bg-status-info/15 text-status-info" },
};

type DiffFileState = {
  expanded: boolean;
  hunks: ReadonlyArray<DiffHunkType>;
  loading: boolean;
  error: string | null;
  viewed: boolean;
  activeCommentLine: CommentLineKey | null;
};

type DiffFileAction =
  | { type: "toggle_expand" }
  | { type: "set_hunks"; hunks: ReadonlyArray<DiffHunkType> }
  | { type: "fetch_start" }
  | { type: "fetch_error"; message: string }
  | { type: "fetch_done" }
  | { type: "toggle_viewed" }
  | { type: "toggle_comment_line"; key: CommentLineKey };

function diffFileReducer(state: DiffFileState, action: DiffFileAction): DiffFileState {
  switch (action.type) {
    case "toggle_expand":
      return { ...state, expanded: !state.expanded };
    case "fetch_start":
      return { ...state, loading: true };
    case "set_hunks":
      return { ...state, hunks: action.hunks, loading: false };
    case "fetch_error":
      return { ...state, error: action.message, loading: false };
    case "fetch_done":
      return { ...state, loading: false };
    case "toggle_viewed":
      return { ...state, viewed: !state.viewed };
    case "toggle_comment_line":
      return {
        ...state,
        activeCommentLine: state.activeCommentLine === action.key ? null : action.key,
      };
  }
}

const fetchHunks = (reviewId: string, filePath: string) =>
  Effect.gen(function* () {
    const { http } = yield* ApiClient;
    const { hunks } = yield* http.reviewFiles.hunks({
      path: { reviewId: reviewId as ReviewId },
      urlParams: { path: filePath },
    });
    return hunks;
  }).pipe(
    Effect.timeout("30 seconds"),
    Effect.withSpan("fetchHunks", { attributes: { reviewId, filePath } }),
  );

/**
 * Fetch hunks on-demand when a file is expanded in review context.
 * Resilient to React StrictMode double-mounting: cleanup interrupts
 * the in-flight fiber so the re-mount starts a fresh request.
 */
function useLazyHunks(
  reviewId: string | undefined,
  filePath: string,
  expanded: boolean,
  hasHunks: boolean,
  dispatch: React.Dispatch<DiffFileAction>,
) {
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!expanded || !reviewId || hasHunks) return;
    if (fetchedRef.current) return;

    fetchedRef.current = true;
    dispatch({ type: "fetch_start" });

    const fiber = clientRuntime.runFork(
      fetchHunks(reviewId, filePath).pipe(
        Effect.matchCauseEffect({
          onSuccess: (hunks) =>
            Effect.sync(() => dispatch({ type: "set_hunks", hunks })),
          onFailure: (cause) =>
            Cause.isInterruptedOnly(cause)
              ? Effect.sync(() => {
                  fetchedRef.current = false;
                  dispatch({ type: "fetch_done" });
                })
              : Effect.sync(() =>
                  dispatch({
                    type: "fetch_error",
                    message: Cause.pretty(cause),
                  }),
                ),
        }),
      ),
    );

    return () => {
      clientRuntime.runFork(Fiber.interrupt(fiber));
    };
  }, [expanded, reviewId, hasHunks, filePath, dispatch]);
}

export function DiffFile({
  file,
  defaultExpanded = false,
  reviewId,
  diffMode = "unified",
}: {
  file: DiffFileType;
  defaultExpanded?: boolean;
  reviewId?: string;
  diffMode?: "split" | "unified";
}) {
  const [state, dispatch] = useReducer(diffFileReducer, {
    expanded: defaultExpanded,
    hunks: file.hunks,
    loading: false,
    error: null,
    viewed: false,
    activeCommentLine: null,
  });
  const { expanded, hunks, loading, error, viewed, activeCommentLine } = state;
  const badge = statusBadge[file.status];

  // Collect unique line contents for syntax highlighting (stable ref via useMemo)
  const allLineContents = useMemo(
    () =>
      expanded && hunks.length > 0
        ? hunks.flatMap((h) => h.lines.map((l) => l.content))
        : [],
    [expanded, hunks],
  );
  const language = useMemo(() => detectLanguage(file.newPath), [file.newPath]);
  const { lineHtml } = useSyntaxHighlight(allLineContents, language);

  // Lazy-load hunks when expanded in a review context with no pre-loaded hunks
  useLazyHunks(reviewId, file.newPath, expanded, hunks.length > 0, dispatch);

  const handleCopyDiff = useCallback(() => {
    const text = hunks
      .flatMap((h) => h.lines.map((l) => l.content))
      .join("\n");
    void navigator.clipboard.writeText(text);
  }, [hunks]);

  // Toggle inline comment form for a given line
  const handleAddComment = useCallback(
    (lineNumber: number, lineType: DiffLineType["type"]) => {
      dispatch({ type: "toggle_comment_line", key: makeCommentLineKey(lineNumber, lineType) });
    },
    [],
  );

  return (
    <div
      id={`diff-file-${file.newPath.replace(/\//g, "-")}`}
      className="border border-border-default bg-surface-elevated rounded-sm overflow-hidden"
    >
      <button
        onClick={() => dispatch({ type: "toggle_expand" })}
        className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-overlay transition-colors"
      >
        <span className="text-text-tertiary text-xs">
          {expanded ? "▼" : "▶"}
        </span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-medium",
            badge.className,
          )}
        >
          {badge.label}
        </span>
        <span className="flex-1 truncate text-text-primary font-mono text-xs">
          {file.newPath}
        </span>
        <span className="text-xs tabular-nums">
          <span className="text-diff-add-text">+{file.additions}</span>{" "}
          <span className="text-diff-remove-text">-{file.deletions}</span>
        </span>
      </button>

      {expanded && (
        <>
          {/* File-level action row */}
          <div className="flex items-center gap-2 px-4 py-1.5 border-t border-border-subtle bg-surface-secondary">
            <button
              onClick={() => dispatch({ type: "toggle_viewed" })}
              className={cn(
                "rounded px-2 py-0.5 text-[10px] font-medium transition-colors",
                viewed
                  ? "bg-accent-muted text-accent-primary"
                  : "text-text-tertiary hover:text-text-secondary hover:bg-surface-overlay",
              )}
            >
              {viewed ? "Viewed" : "Mark viewed"}
            </button>
            <button
              onClick={handleCopyDiff}
              className="rounded px-2 py-0.5 text-[10px] font-medium text-text-tertiary hover:text-text-secondary hover:bg-surface-overlay transition-colors"
            >
              Copy Diff
            </button>
          </div>

          <div className="border-t border-border-default">
            {loading ? (
              <div className="px-4 py-3 text-xs text-text-tertiary italic">
                Loading diff…
              </div>
            ) : error ? (
              <div className="px-4 py-3 text-xs text-status-error italic">
                {error}
              </div>
            ) : hunks.length === 0 ? (
              <div className="px-4 py-3 text-xs text-text-tertiary italic">
                Binary file or mode change
              </div>
            ) : (
              hunks.map((hunk) => (
                <DiffHunk
                  key={`${hunk.oldStart}-${hunk.newStart}`}
                  hunk={hunk}
                  mode={diffMode}
                  lineHtml={lineHtml}
                  onAddComment={reviewId ? handleAddComment : undefined}
                  activeCommentLine={activeCommentLine}
                  reviewId={reviewId}
                  filePath={file.newPath}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
