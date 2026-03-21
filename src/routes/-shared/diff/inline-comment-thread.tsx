"use client";

import { useRouter } from "@tanstack/react-router";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import { useCallback, useState } from "react";

import { ApiClient } from "@/api/api-client";
import type { Comment } from "@/api/schemas/comment";
import { clientRuntime } from "@/lib/client-runtime";
import { cn } from "@/lib/utils";

interface InlineCommentThreadProps {
  comments: readonly Comment[];
  reviewId: string;
}

const INITIAL_VISIBLE_COMMENTS = 3;

const formatCompactDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(date);
};

const getCommentInitials = (commentId: Comment["id"]): string =>
  commentId.slice(0, 2).toUpperCase();

type CommentAction = "resolve" | "unresolve" | "delete";

interface CommentCardProps {
  comment: Comment;
  index: number;
  error: string | null;
  pending: boolean;
  runCommentAction: (commentId: Comment["id"], action: CommentAction) => void;
}

const CommentCard = ({
  comment,
  index,
  error,
  pending,
  runCommentAction,
}: CommentCardProps) => {
  const resolveLabel = comment.resolved ? "Unresolve" : "Resolve";

  const handleResolveToggle = useCallback(() => {
    runCommentAction(comment.id, comment.resolved ? "unresolve" : "resolve");
  }, [comment.id, comment.resolved, runCommentAction]);

  const handleDelete = useCallback(() => {
    runCommentAction(comment.id, "delete");
  }, [comment.id, runCommentAction]);

  return (
    <article
      className={cn(
        "group animate-in fade-in duration-100 rounded-md border border-border-subtle bg-surface-elevated/80 px-2 py-1.5 shadow-sm shadow-black/10 transition-opacity",
        comment.resolved && "opacity-50"
      )}
      style={{ transitionDelay: `${index * 50}ms` }}
    >
      <div className="flex items-start gap-2">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-muted font-mono text-[10px] font-semibold text-accent-primary">
          {getCommentInitials(comment.id)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10px] text-text-tertiary">
            <span className="font-mono">
              {formatCompactDate(comment.createdAt)}
            </span>
            {comment.resolved ? (
              <span className="rounded-full bg-status-success/15 px-1.5 py-0.5 text-[10px] font-medium text-status-success">
                Resolved
              </span>
            ) : null}
            <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              <button
                type="button"
                onClick={handleResolveToggle}
                disabled={pending}
                aria-label={`${resolveLabel} comment ${comment.id}`}
                className="rounded px-1 py-0.5 text-[10px] text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary focus-visible:bg-surface-overlay focus-visible:text-text-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resolveLabel}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={pending}
                aria-label={`Delete comment ${comment.id}`}
                className="rounded px-1 py-0.5 text-[10px] text-text-tertiary transition-colors hover:bg-status-error/10 hover:text-status-error focus-visible:bg-status-error/10 focus-visible:text-status-error focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                Delete
              </button>
            </div>
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

          {error ? (
            <p className="mt-1 text-[10px] text-status-error">{error}</p>
          ) : null}
        </div>
      </div>
    </article>
  );
};

export const InlineCommentThread = ({
  comments,
  reviewId,
}: InlineCommentThreadProps) => {
  const [expanded, setExpanded] = useState(false);
  const [pendingCommentId, setPendingCommentId] = useState<
    Comment["id"] | null
  >(null);
  const [errorByCommentId, setErrorByCommentId] = useState<
    Record<string, string | null>
  >({});
  const router = useRouter();

  const hiddenCount = Math.max(0, comments.length - INITIAL_VISIBLE_COMMENTS);
  const visibleComments = expanded
    ? comments
    : comments.slice(0, INITIAL_VISIBLE_COMMENTS);

  const runCommentAction = useCallback(
    (commentId: Comment["id"], action: CommentAction) => {
      if (pendingCommentId) {
        return;
      }

      setPendingCommentId(commentId);
      setErrorByCommentId((current) => ({
        ...current,
        [commentId]: null,
      }));

      clientRuntime.runFork(
        Effect.gen(function* performCommentAction() {
          const { http } = yield* ApiClient;

          if (action === "resolve") {
            return yield* http.comments.resolve({ path: { id: commentId } });
          }

          if (action === "unresolve") {
            return yield* http.comments.unresolve({ path: { id: commentId } });
          }

          return yield* http.comments.remove({ path: { id: commentId } });
        }).pipe(
          Effect.tap(() => Effect.promise(() => router.invalidate())),
          Effect.tapErrorCause((cause) =>
            Effect.sync(() => {
              setErrorByCommentId((current) => ({
                ...current,
                [commentId]: Cause.pretty(cause),
              }));
            })
          ),
          Effect.ensuring(Effect.sync(() => setPendingCommentId(null)))
        )
      );
    },
    [pendingCommentId, router]
  );

  const toggleExpanded = useCallback(() => {
    setExpanded((current) => !current);
  }, []);

  if (comments.length === 0) {
    return null;
  }

  return (
    <div
      data-review-id={reviewId}
      className="animate-in fade-in slide-in-from-top-1 duration-150 border-l-2 border-accent-primary/30 pl-2"
    >
      <div className="flex flex-col gap-1.5">
        {visibleComments.map((comment, index) => (
          <CommentCard
            key={comment.id}
            comment={comment}
            index={index}
            error={errorByCommentId[comment.id] ?? null}
            pending={pendingCommentId === comment.id}
            runCommentAction={runCommentAction}
          />
        ))}

        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={toggleExpanded}
            aria-expanded={expanded}
            className="self-start rounded px-1 py-0.5 text-[10px] font-medium text-accent-primary transition-colors hover:bg-accent-muted/40 hover:text-accent-primary-hover focus-visible:bg-accent-muted/40 focus-visible:text-accent-primary-hover focus-visible:outline-none"
          >
            {expanded ? "Show less" : `Show ${hiddenCount} more`}
          </button>
        ) : null}
      </div>
    </div>
  );
};
