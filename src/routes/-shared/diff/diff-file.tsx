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
import { SplitDiffSplitter } from "@/components/review/split-diff-splitter";
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

/** A session-scoped comment that lives only in component state (no review). */
export interface LocalComment {
  readonly id: string;
  readonly content: string;
  readonly suggestion: string | null;
  readonly filePath: string;
  readonly lineNumber: number;
  readonly lineType: "added" | "removed";
  readonly side: CommentSide;
  readonly createdAt: string;
}

interface LineAnnotationMeta {
  draft: ActiveCommentDraft | null;
  comments: readonly Comment[];
  localComments: readonly LocalComment[];
}

interface DiffFileState {
  expanded: boolean;
  hunks: readonly DiffHunkType[];
  loading: boolean;
  error: string | null;
  activeComment: ActiveCommentDraft | null;
  localComments: readonly LocalComment[];
}

type DiffFileAction =
  | { type: "toggle_expand" }
  | { type: "set_hunks"; hunks: readonly DiffHunkType[] }
  | { type: "fetch_start" }
  | { type: "fetch_error"; message: string }
  | { type: "fetch_done" }
  | { type: "toggle_comment_line"; draft: ActiveCommentDraft }
  | { type: "close_comment" }
  | { type: "add_local_comment"; comment: LocalComment }
  | { type: "delete_local_comment"; id: string };

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
    case "add_local_comment": {
      return {
        ...state,
        activeComment: null,
        localComments: [...state.localComments, action.comment],
      };
    }
    case "delete_local_comment": {
      return {
        ...state,
        localComments: state.localComments.filter((c) => c.id !== action.id),
      };
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

/**
 * The "+" button shown in the gutter when hovering a commentable diff line.
 *
 * Rendering context (from @pierre/diffs):
 * The library's `renderGutterUtility` slot mechanism works as follows:
 *   Shadow DOM:  [data-column-number] (position: relative)
 *                  └─ [data-gutter-utility-slot] (position: absolute; right:0; top:0; bottom:0;
 *                  │                              display: flex; justify-content: flex-end)
 *                  │    └─ <slot name="gutter-utility-slot">
 *   Light DOM:   <div slot="gutter-utility-slot"  ← projected into shadow slot
 *                     style="position: absolute; top:0; bottom:0; text-align: center">
 *                  └─ THIS BUTTON
 *
 * The slotted wrapper div has `position: absolute` (set by the library's
 * GutterUtilitySlotStyles), which takes it out of the flex flow of the
 * shadow-DOM [data-gutter-utility-slot] container. This collapses the
 * container to zero width. Without corrective styles the button ends up
 * overflowing into the code-content column — effectively invisible.
 *
 * We fix this by adding a CSS override (in styles.css) that changes the
 * slotted wrapper to `position: static !important` so it participates in
 * the parent's flex layout. Then the button sits inside the gutter column,
 * aligned to the flex-end, matching the library's own default utility
 * button placement.
 *
 * The button itself mirrors the library's `[data-utility-button]` styles:
 *   • `position: relative; z-index: 4` to paint above line-number content.
 */
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
      className="ringi-gutter-add-btn relative z-[4] flex items-center justify-center rounded-sm bg-accent-primary text-[11px] font-medium text-white shadow-sm shadow-accent-primary/30 transition-[transform,background-color] duration-150 ease-out hover:scale-105 hover:bg-accent-primary-hover focus-visible:scale-105 focus-visible:bg-accent-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40 active:scale-95"
      aria-label="Add comment on this line"
      tabIndex={0}
    >
      +
    </button>
  );
};

const formatCompactTimestamp = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const LocalCommentCard = ({
  comment,
  index,
  onDelete,
}: {
  comment: LocalComment;
  index: number;
  onDelete: (id: string) => void;
}) => {
  const handleDelete = useCallback(() => {
    onDelete(comment.id);
  }, [comment.id, onDelete]);

  return (
    <article
      className="ringi-comment-card group rounded-md border border-border-subtle bg-surface-elevated/80 px-2 py-1.5 shadow-sm shadow-black/10"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="flex items-start gap-2">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-muted font-mono text-[10px] font-semibold text-accent-primary">
          ✎
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10px] text-text-tertiary">
            <span className="rounded-full bg-surface-overlay px-1.5 py-0.5 font-medium">
              Note
            </span>
            <span className="font-mono">
              {formatCompactTimestamp(comment.createdAt)}
            </span>
            <button
              type="button"
              onClick={handleDelete}
              aria-label="Delete comment"
              className="ml-auto rounded px-1 py-0.5 text-[10px] text-text-tertiary opacity-0 transition-opacity hover:bg-status-error/10 hover:text-status-error focus-visible:bg-status-error/10 focus-visible:text-status-error focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100"
            >
              Delete
            </button>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-text-primary">
            {comment.content}
          </p>
          {comment.suggestion ? (
            <div className="mt-1.5 border-l-2 border-status-success/35 bg-surface-primary/80 pl-2">
              <pre className="overflow-x-auto whitespace-pre-wrap break-words py-1 font-mono text-[10px] leading-4 text-text-secondary">
                {comment.suggestion}
              </pre>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
};

export const DiffFile = ({
  file,
  defaultExpanded = false,
  reviewId,
  diffMode = "unified",
  comments = [],
  onLocalCommentsChange,
  viewed = false,
  onToggleViewed,
}: {
  file: DiffFileType;
  defaultExpanded?: boolean;
  reviewId?: string;
  diffMode?: "split" | "unified";
  comments?: readonly Comment[];
  onLocalCommentsChange?: (
    filePath: string,
    localComments: readonly LocalComment[]
  ) => void;
  viewed?: boolean;
  onToggleViewed?: (filePath: string) => void;
}) => {
  const [state, dispatch] = useReducer(diffFileReducer, {
    activeComment: null,
    error: null,
    expanded: defaultExpanded,
    hunks: file.hunks,
    loading: false,
    localComments: [],
  });
  const { expanded, hunks, loading, error, activeComment, localComments } =
    state;
  const badge = statusBadge[file.status];

  useLazyHunks(reviewId, file.newPath, expanded, hunks.length > 0, dispatch);

  useEffect(() => {
    onLocalCommentsChange?.(file.newPath, localComments);
  }, [file.newPath, localComments, onLocalCommentsChange]);

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

  const handleLocalSubmit = useCallback(
    (content: string, suggestion: string | null) => {
      if (!activeComment) {
        return;
      }

      dispatch({
        comment: {
          content,
          createdAt: new Date().toISOString(),
          filePath: activeComment.filePath,
          id: `local-${crypto.randomUUID()}`,
          lineNumber: activeComment.lineNumber,
          lineType: activeComment.lineType,
          side: activeComment.side,
          suggestion,
        },
        type: "add_local_comment",
      });
    },
    [activeComment]
  );

  const handleDeleteLocalComment = useCallback((id: string) => {
    dispatch({ id, type: "delete_local_comment" });
  }, []);

  const handleToggleExpand = useCallback(() => {
    dispatch({ type: "toggle_expand" });
  }, []);

  const handleToggleViewed = useCallback(() => {
    onToggleViewed?.(file.newPath);
  }, [file.newPath, onToggleViewed]);

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

  const getOrCreateAnnotation = (
    map: Map<ActiveCommentKey, LineAnnotationMeta>,
    key: ActiveCommentKey
  ): LineAnnotationMeta => {
    const existing = map.get(key);
    if (existing) {
      return existing;
    }

    const fresh: LineAnnotationMeta = {
      comments: [],
      draft: null,
      localComments: [],
    };
    map.set(key, fresh);
    return fresh;
  };

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
        const entry = getOrCreateAnnotation(annotationMap, key);
        entry.comments = [...entry.comments, comment];
      }

      for (const local of localComments) {
        const key = buildActiveCommentKey(local.lineNumber, local.side);
        const entry = getOrCreateAnnotation(annotationMap, key);
        entry.localComments = [...entry.localComments, local];
      }

      if (activeComment) {
        const entry = getOrCreateAnnotation(annotationMap, activeComment.key);
        entry.draft = activeComment;
      }

      return [...annotationMap.entries()].map(([key, metadata]) => {
        const [lineNumber, side] = key.split(":") as [string, CommentSide];
        return {
          lineNumber: Number(lineNumber),
          metadata,
          side,
        };
      });
    }, [activeComment, comments, localComments]);

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
    enableGutterUtility: true,
    lineHoverHighlight: "both",
  };

  const renderAnnotation = useCallback(
    (annotation: DiffLineAnnotation<LineAnnotationMeta>) => {
      if (!annotation.metadata) {
        return null;
      }

      const {
        draft,
        comments: lineComments,
        localComments: lineLocalComments,
      } = annotation.metadata;
      const hasContent =
        draft || lineComments.length > 0 || lineLocalComments.length > 0;

      if (!hasContent) {
        return null;
      }

      return (
        <div>
          {lineComments.length > 0 && reviewId ? (
            <InlineCommentThread comments={lineComments} reviewId={reviewId} />
          ) : null}

          {lineLocalComments.length > 0 ? (
            <div className="border-l-2 border-accent-primary/30 pl-2">
              <div className="flex flex-col gap-1.5">
                {lineLocalComments.map((lc, i) => (
                  <LocalCommentCard
                    key={lc.id}
                    comment={lc}
                    index={i}
                    onDelete={handleDeleteLocalComment}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {draft ? (
            <InlineCommentComposer
              draft={draft}
              reviewId={reviewId}
              originalCode={getOriginalCodeForLine(
                draft.lineNumber,
                draft.side
              )}
              onCancel={handleCloseComment}
              onSubmitted={handleCloseComment}
              onLocalSubmit={reviewId ? undefined : handleLocalSubmit}
            />
          ) : null}
        </div>
      );
    },
    [
      getOriginalCodeForLine,
      handleCloseComment,
      handleDeleteLocalComment,
      handleLocalSubmit,
      reviewId,
    ]
  );

  const renderGutterUtility = useCallback(
    (
      getHoveredLine: () =>
        | { lineNumber: number; side: CommentSide }
        | undefined
    ) => (
      <GutterAddButton
        getHoveredLine={getHoveredLine}
        onAddComment={handleAddComment}
      />
    ),
    [handleAddComment]
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
      <SplitDiffSplitter enabled={diffMode === "split"}>
        <PatchDiff<LineAnnotationMeta>
          patch={patchString}
          options={diffOptions}
          lineAnnotations={lineAnnotations}
          renderAnnotation={renderAnnotation}
          renderGutterUtility={renderGutterUtility}
          className="ringi-diff-file"
        />
      </SplitDiffSplitter>
    );
  }

  const viewedButtonLabel = viewed ? "Viewed ✓" : "Mark as viewed";

  return (
    <div
      id={`diff-file-${file.newPath.replaceAll("/", "-")}`}
      className="overflow-hidden rounded-sm border border-border-default bg-surface-elevated"
    >
      {/* ── File header bar ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        <button
          type="button"
          onClick={handleToggleExpand}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] text-text-quaternary transition-[transform,color] duration-100 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:text-text-secondary active:scale-[0.9] motion-reduce:transform-none"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse file" : "Expand file"}
        >
          <span
            className={cn(
              "transition-transform duration-100 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
              expanded && "rotate-90"
            )}
          >
            ▶
          </span>
        </button>

        <span
          className={cn(
            "rounded px-1 py-0.5 text-[10px] font-semibold leading-none",
            badge.className
          )}
        >
          {badge.label}
        </span>

        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-text-primary">
          {file.newPath}
        </span>

        <span className="flex shrink-0 items-center gap-2 text-[10px] tabular-nums text-text-quaternary">
          {file.additions > 0 ? (
            <span className="text-diff-add-text/70">+{file.additions}</span>
          ) : null}
          {file.deletions > 0 ? (
            <span className="text-diff-remove-text/70">-{file.deletions}</span>
          ) : null}
        </span>

        {/* ── Review action: viewed toggle ───────────────────────── */}
        {onToggleViewed ? (
          <button
            type="button"
            onClick={handleToggleViewed}
            className={cn(
              "ml-1 shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-medium transition-[background-color,border-color,color] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] motion-reduce:transform-none",
              viewed
                ? "border-status-success/30 bg-status-success/10 text-status-success"
                : "border-border-default text-text-tertiary hover:border-border-default hover:bg-surface-overlay hover:text-text-secondary"
            )}
          >
            {viewedButtonLabel}
          </button>
        ) : null}
      </div>

      {/* ── Diff content ────────────────────────────────────────── */}
      {expanded ? (
        <div className="border-t border-border-default">{diffContent}</div>
      ) : null}
    </div>
  );
};
