import type { FileDiffOptions } from "@pierre/diffs";
import { PatchDiff } from "@pierre/diffs/react";
import type { DiffLineAnnotation } from "@pierre/diffs/react";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { Dispatch, ReactNode } from "react";

import { ApiClient } from "@/api/api-client";
import type { Comment } from "@/api/schemas/comment";
import type {
  DiffFile as DiffFileType,
  DiffHunk as DiffHunkType,
  DiffStatus,
} from "@/api/schemas/diff";
import type { ReviewId } from "@/api/schemas/review";
import { clientRuntime } from "@/lib/client-runtime";
import { pierreDiffOptions } from "@/lib/pierre-diffs-theme";
import { cn } from "@/lib/utils";

import { InlineCommentComposer } from "./inline-comment-composer";
import type { CommentDraft } from "./inline-comment-composer";
import { InlineCommentThread } from "./inline-comment-thread";
import { toPatchString } from "./pierre-adapter";

const statusBadge: Record<DiffStatus, { label: string; className: string }> = {
  added: { className: "bg-status-success/15 text-status-success", label: "A" },
  deleted: { className: "bg-status-error/15 text-status-error", label: "D" },
  modified: {
    className: "bg-status-warning/15 text-status-warning",
    label: "M",
  },
  renamed: { className: "bg-status-info/15 text-status-info", label: "R" },
};

type CommentSide = DiffLineAnnotation<CommentDraft>["side"];
type ActiveCommentKey = `${number}:${CommentSide}`;
type ActiveCommentDraft = CommentDraft & { key: ActiveCommentKey };

interface LineAnnotationMeta {
  draft: ActiveCommentDraft | null;
  comments: readonly Comment[];
}

interface DiffFileState {
  expanded: boolean;
  hunks: readonly DiffHunkType[];
  loading: boolean;
  error: string | null;
  viewed: boolean;
  activeComment: ActiveCommentDraft | null;
}

type DiffFileAction =
  | { type: "toggle_expand" }
  | { type: "set_hunks"; hunks: readonly DiffHunkType[] }
  | { type: "fetch_start" }
  | { type: "fetch_error"; message: string }
  | { type: "fetch_done" }
  | { type: "toggle_viewed" }
  | { type: "toggle_comment_line"; draft: ActiveCommentDraft }
  | { type: "close_comment" };

const buildActiveCommentKey = (
  lineNumber: number,
  side: CommentSide
): ActiveCommentKey => `${lineNumber}:${side}`;

const sideToCommentLineType = (side: CommentSide): CommentDraft["lineType"] =>
  side === "additions" ? "added" : "removed";

const diffFileReducer = (
  state: DiffFileState,
  action: DiffFileAction
): DiffFileState => {
  switch (action.type) {
    case "toggle_expand": {
      return { ...state, expanded: !state.expanded };
    }
    case "fetch_start": {
      return { ...state, error: null, loading: true };
    }
    case "set_hunks": {
      return { ...state, hunks: action.hunks, loading: false };
    }
    case "fetch_error": {
      return { ...state, error: action.message, loading: false };
    }
    case "fetch_done": {
      return { ...state, loading: false };
    }
    case "toggle_viewed": {
      return { ...state, viewed: !state.viewed };
    }
    case "toggle_comment_line": {
      return {
        ...state,
        activeComment:
          state.activeComment?.key === action.draft.key ? null : action.draft,
      };
    }
    case "close_comment": {
      return { ...state, activeComment: null };
    }
    default: {
      return state;
    }
  }
};

const fetchHunks = (reviewId: string, filePath: string) =>
  Effect.gen(function* loadReviewHunks() {
    const { http } = yield* ApiClient;
    const { hunks } = yield* http.reviewFiles.hunks({
      path: { reviewId: reviewId as ReviewId },
      urlParams: { path: filePath },
    });
    return hunks;
  }).pipe(
    Effect.timeout("30 seconds"),
    Effect.withSpan("fetchHunks", { attributes: { filePath, reviewId } })
  );

const useLazyHunks = (
  reviewId: string | undefined,
  filePath: string,
  expanded: boolean,
  hasHunks: boolean,
  dispatch: Dispatch<DiffFileAction>
) => {
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!expanded || !reviewId || hasHunks) {
      return;
    }

    if (fetchedRef.current) {
      return;
    }

    fetchedRef.current = true;
    dispatch({ type: "fetch_start" });

    const fiber = clientRuntime.runFork(
      fetchHunks(reviewId, filePath).pipe(
        Effect.matchCauseEffect({
          onFailure: (cause) =>
            Cause.isInterruptedOnly(cause)
              ? Effect.sync(() => {
                  fetchedRef.current = false;
                  dispatch({ type: "fetch_done" });
                })
              : Effect.sync(() =>
                  dispatch({
                    message: Cause.pretty(cause),
                    type: "fetch_error",
                  })
                ),
          onSuccess: (hunks) =>
            Effect.sync(() => dispatch({ hunks, type: "set_hunks" })),
        })
      )
    );

    return () => {
      clientRuntime.runFork(Fiber.interrupt(fiber));
    };
  }, [dispatch, expanded, filePath, hasHunks, reviewId]);
};

const GutterAddButton = ({
  getHoveredLine,
  onAddComment,
}: {
  getHoveredLine: () => { lineNumber: number; side: CommentSide } | undefined;
  onAddComment: (lineNumber: number, side: CommentSide) => void;
}) => {
  const handleClick = useCallback(() => {
    const hoveredLine = getHoveredLine();
    if (!hoveredLine) {
      return;
    }

    onAddComment(hoveredLine.lineNumber, hoveredLine.side);
  }, [getHoveredLine, onAddComment]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-primary text-[11px] font-medium text-white shadow-sm shadow-accent-primary/30 transition-all hover:scale-110 hover:bg-accent-primary-hover active:scale-95"
      aria-label="Add comment on this line"
    >
      +
    </button>
  );
};

export const DiffFile = ({
  file,
  defaultExpanded = false,
  reviewId,
  diffMode = "unified",
  comments = [],
}: {
  file: DiffFileType;
  defaultExpanded?: boolean;
  reviewId?: string;
  diffMode?: "split" | "unified";
  comments?: readonly Comment[];
}) => {
  const [state, dispatch] = useReducer(diffFileReducer, {
    activeComment: null,
    error: null,
    expanded: defaultExpanded,
    hunks: file.hunks,
    loading: false,
    viewed: false,
  });
  const { expanded, hunks, loading, error, viewed, activeComment } = state;
  const badge = statusBadge[file.status];

  useLazyHunks(reviewId, file.newPath, expanded, hunks.length > 0, dispatch);

  const handleCopyDiff = useCallback(async () => {
    const text = hunks
      .flatMap((hunk) => hunk.lines.map((line) => line.content))
      .join("\n");
    await navigator.clipboard.writeText(text);
  }, [hunks]);

  const handleAddComment = useCallback(
    (lineNumber: number, side: CommentSide) => {
      dispatch({
        draft: {
          filePath: file.newPath,
          key: buildActiveCommentKey(lineNumber, side),
          lineNumber,
          lineType: sideToCommentLineType(side),
          side,
        },
        type: "toggle_comment_line",
      });
    },
    [file.newPath]
  );

  const handleCloseComment = useCallback(() => {
    dispatch({ type: "close_comment" });
  }, []);

  const handleToggleExpand = useCallback(() => {
    dispatch({ type: "toggle_expand" });
  }, []);

  const handleToggleViewed = useCallback(() => {
    dispatch({ type: "toggle_viewed" });
  }, []);

  const getOriginalCodeForLine = useCallback(
    (lineNumber: number, side: CommentSide): string => {
      for (const hunk of hunks) {
        for (const line of hunk.lines) {
          const currentLineNumber =
            side === "additions" ? line.newLineNumber : line.oldLineNumber;
          if (currentLineNumber === lineNumber) {
            return line.content;
          }
        }
      }

      return "";
    },
    [hunks]
  );

  const lineAnnotations =
    useMemo((): DiffLineAnnotation<LineAnnotationMeta>[] => {
      const annotationMap = new Map<ActiveCommentKey, LineAnnotationMeta>();

      for (const comment of comments) {
        if (comment.lineNumber === null || comment.lineNumber === undefined) {
          continue;
        }

        const side: CommentSide =
          comment.lineType === "removed" ? "deletions" : "additions";
        const key = buildActiveCommentKey(comment.lineNumber, side);
        const existing = annotationMap.get(key);

        if (existing) {
          existing.comments = [...existing.comments, comment];
          continue;
        }

        annotationMap.set(key, { comments: [comment], draft: null });
      }

      if (activeComment) {
        const existing = annotationMap.get(activeComment.key);

        if (existing) {
          existing.draft = activeComment;
        } else {
          annotationMap.set(activeComment.key, {
            comments: [],
            draft: activeComment,
          });
        }
      }

      return [...annotationMap.entries()].map(([key, metadata]) => {
        const [lineNumber, side] = key.split(":") as [string, CommentSide];
        return {
          lineNumber: Number(lineNumber),
          metadata,
          side,
        };
      });
    }, [activeComment, comments]);

  const patchString = useMemo(() => {
    if (hunks.length === 0) {
      return "";
    }

    return toPatchString({ ...file, hunks: hunks as DiffFileType["hunks"] });
  }, [file, hunks]);

  const diffOptions: FileDiffOptions<LineAnnotationMeta> = {
    ...(pierreDiffOptions as FileDiffOptions<LineAnnotationMeta>),
    diffStyle: diffMode,
    disableFileHeader: true,
    enableGutterUtility: Boolean(reviewId),
  };

  const renderAnnotation = useCallback(
    (annotation: DiffLineAnnotation<LineAnnotationMeta>) => {
      if (!annotation.metadata) {
        return null;
      }

      const { draft, comments: lineComments } = annotation.metadata;
      const hasContent = draft || lineComments.length > 0;

      if (!hasContent) {
        return null;
      }

      return (
        <div>
          {lineComments.length > 0 ? (
            <InlineCommentThread
              comments={lineComments}
              reviewId={reviewId ?? ""}
            />
          ) : null}
          {draft && reviewId ? (
            <InlineCommentComposer
              draft={draft}
              reviewId={reviewId}
              originalCode={getOriginalCodeForLine(
                draft.lineNumber,
                draft.side
              )}
              onCancel={handleCloseComment}
              onSubmitted={handleCloseComment}
            />
          ) : null}
        </div>
      );
    },
    [getOriginalCodeForLine, handleCloseComment, reviewId]
  );

  const renderGutterUtility = useCallback(
    (
      getHoveredLine: () =>
        | { lineNumber: number; side: CommentSide }
        | undefined
    ) => {
      if (!reviewId) {
        return null;
      }

      return (
        <GutterAddButton
          getHoveredLine={getHoveredLine}
          onAddComment={handleAddComment}
        />
      );
    },
    [handleAddComment, reviewId]
  );

  let diffContent: ReactNode;

  if (loading) {
    diffContent = (
      <div className="px-4 py-3 text-xs italic text-text-tertiary">
        Loading diff…
      </div>
    );
  } else if (error) {
    diffContent = (
      <div className="px-4 py-3 text-xs italic text-status-error">{error}</div>
    );
  } else if (hunks.length === 0) {
    diffContent = (
      <div className="px-4 py-3 text-xs italic text-text-tertiary">
        Binary file or mode change
      </div>
    );
  } else {
    diffContent = (
      <PatchDiff<LineAnnotationMeta>
        patch={patchString}
        options={diffOptions}
        lineAnnotations={lineAnnotations}
        renderAnnotation={renderAnnotation}
        renderGutterUtility={renderGutterUtility}
        className="ringi-diff-file"
      />
    );
  }

  return (
    <div
      id={`diff-file-${file.newPath.replaceAll("/", "-")}`}
      className="overflow-hidden rounded-sm border border-border-default bg-surface-elevated"
    >
      <button
        type="button"
        onClick={handleToggleExpand}
        className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-surface-overlay"
      >
        <span className="text-xs text-text-tertiary">
          {expanded ? "▼" : "▶"}
        </span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-medium",
            badge.className
          )}
        >
          {badge.label}
        </span>
        <span className="flex-1 truncate font-mono text-xs text-text-primary">
          {file.newPath}
        </span>
        <span className="text-xs tabular-nums">
          <span className="text-diff-add-text">+{file.additions}</span>{" "}
          <span className="text-diff-remove-text">-{file.deletions}</span>
        </span>
      </button>

      {expanded ? (
        <>
          <div className="flex items-center gap-2 border-t border-border-subtle bg-surface-secondary px-4 py-1.5">
            <button
              type="button"
              onClick={handleToggleViewed}
              className={cn(
                "rounded px-2 py-0.5 text-[10px] font-medium transition-colors",
                viewed
                  ? "bg-accent-muted text-accent-primary"
                  : "text-text-tertiary hover:bg-surface-overlay hover:text-text-secondary"
              )}
            >
              {viewed ? "Viewed" : "Mark viewed"}
            </button>
            <button
              type="button"
              onClick={handleCopyDiff}
              className="rounded px-2 py-0.5 text-[10px] font-medium text-text-tertiary transition-colors hover:bg-surface-overlay hover:text-text-secondary"
            >
              Copy Diff
            </button>
          </div>

          <div className="border-t border-border-default">{diffContent}</div>
        </>
      ) : null}
    </div>
  );
};
