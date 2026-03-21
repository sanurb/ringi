"use client";

import { useRouter } from "@tanstack/react-router";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, KeyboardEvent } from "react";

import { ApiClient } from "@/api/api-client";
import type { Comment } from "@/api/schemas/comment";
import type { ReviewId } from "@/api/schemas/review";
import { clientRuntime } from "@/lib/client-runtime";
import { cn } from "@/lib/utils";

import { CodeSuggestionEditor } from "./code-suggestion-editor";

const MIN_TEXTAREA_ROWS = 2;
const MAX_TEXTAREA_ROWS = 6;

type CommentSide = "deletions" | "additions";

export interface CommentDraft {
  key: string;
  filePath: string;
  lineNumber: number;
  lineType: Extract<Comment["lineType"], "added" | "removed">;
  side: CommentSide;
}

interface InlineCommentComposerProps {
  draft: CommentDraft;
  reviewId: string;
  originalCode?: string;
  onCancel: () => void;
  onSubmitted: () => void;
}

const resizeTextarea = (textarea: HTMLTextAreaElement | null) => {
  if (!textarea) {
    return;
  }

  const styles = window.getComputedStyle(textarea);
  const lineHeight = Number.parseFloat(styles.lineHeight || "0") || 16;
  const paddingTop = Number.parseFloat(styles.paddingTop || "0");
  const paddingBottom = Number.parseFloat(styles.paddingBottom || "0");
  const borderTop = Number.parseFloat(styles.borderTopWidth || "0");
  const borderBottom = Number.parseFloat(styles.borderBottomWidth || "0");
  const minHeight =
    lineHeight * MIN_TEXTAREA_ROWS +
    paddingTop +
    paddingBottom +
    borderTop +
    borderBottom;
  const maxHeight =
    lineHeight * MAX_TEXTAREA_ROWS +
    paddingTop +
    paddingBottom +
    borderTop +
    borderBottom;

  textarea.style.height = "0px";
  const nextHeight = Math.min(
    Math.max(textarea.scrollHeight, minHeight),
    maxHeight
  );
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY =
    textarea.scrollHeight > maxHeight ? "auto" : "hidden";
};

export const InlineCommentComposer = ({
  draft,
  reviewId,
  originalCode,
  onCancel,
  onSubmitted,
}: InlineCommentComposerProps) => {
  const [value, setValue] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const helperTextId = useId();
  const errorMessageId = useId();
  const trimmedValue = value.trim();
  const commentLength = value.length;

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    resizeTextarea(textareaRef.current);
  }, [value]);

  const handleSubmit = useCallback(() => {
    if (submitting || trimmedValue.length === 0) {
      return;
    }

    const trimmedSuggestion = suggestion.trim();

    setSubmitting(true);
    setError(null);

    clientRuntime.runFork(
      Effect.gen(function* submitInlineComment() {
        const { http } = yield* ApiClient;
        return yield* http.comments.create({
          path: { reviewId: reviewId as ReviewId },
          payload: {
            content: trimmedValue,
            filePath: draft.filePath,
            lineNumber: draft.lineNumber,
            lineType: draft.lineType,
            suggestion:
              showSuggestion && trimmedSuggestion ? trimmedSuggestion : null,
          },
        });
      }).pipe(
        Effect.tap(() => Effect.sync(onSubmitted)),
        Effect.tap(() => Effect.promise(() => router.invalidate())),
        Effect.tapErrorCause((cause) =>
          Effect.sync(() => setError(Cause.pretty(cause)))
        ),
        Effect.ensuring(Effect.sync(() => setSubmitting(false)))
      )
    );
  }, [
    draft.filePath,
    draft.lineNumber,
    draft.lineType,
    onSubmitted,
    reviewId,
    router,
    showSuggestion,
    submitting,
    suggestion,
    trimmedValue,
  ]);

  const handleFormSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      handleSubmit();
    },
    [handleSubmit]
  );

  const handleKeyDownCapture = useCallback(
    (event: KeyboardEvent<HTMLFormElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
        return;
      }

      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, onCancel]
  );

  const handleCommentChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setValue(event.target.value);
      resizeTextarea(event.target);
    },
    []
  );

  const handleSuggestionToggle = useCallback(() => {
    setShowSuggestion((current) => !current);
  }, []);

  return (
    <form
      onSubmit={handleFormSubmit}
      onKeyDownCapture={handleKeyDownCapture}
      className="animate-in fade-in slide-in-from-top-1 duration-150 border-t border-accent-primary/20 bg-surface-elevated px-4 py-3 shadow-md shadow-black/20"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="rounded bg-accent-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-accent-primary">
            Line {draft.lineNumber}
          </span>
          <span className="truncate font-mono text-[10px] text-text-tertiary">
            {draft.filePath}
          </span>
        </div>

        <button
          type="button"
          onClick={onCancel}
          aria-label="Close comment composer"
          className="flex h-5 w-5 items-center justify-center rounded text-text-tertiary transition-colors hover:bg-surface-overlay hover:text-text-secondary focus-visible:bg-surface-overlay focus-visible:text-text-secondary focus-visible:outline-none"
        >
          ×
        </button>
      </div>

      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleCommentChange}
        rows={MIN_TEXTAREA_ROWS}
        placeholder="Add a comment... (⌘Enter to submit)"
        className="w-full resize-none rounded-sm border border-border-default bg-surface-primary p-2 font-mono text-xs text-text-primary transition-[border-color,box-shadow] placeholder:text-text-tertiary/60 focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary/30"
        aria-label={`Comment for ${draft.filePath} line ${draft.lineNumber}`}
        aria-describedby={
          error ? `${helperTextId} ${errorMessageId}` : helperTextId
        }
        aria-invalid={error ? true : undefined}
      />

      <div id={helperTextId} className="mt-1 text-[10px] text-text-tertiary">
        Comment is required. Press Escape to cancel.
      </div>

      {error ? (
        <p
          id={errorMessageId}
          className="mt-1 text-xs text-status-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={handleSuggestionToggle}
        aria-expanded={showSuggestion}
        className="mt-2 rounded px-1 py-0.5 text-xs text-text-secondary transition-colors hover:bg-surface-overlay hover:text-accent-primary focus-visible:bg-surface-overlay focus-visible:text-accent-primary focus-visible:outline-none"
      >
        {showSuggestion ? "− Remove suggestion" : "+ Add suggested code"}
      </button>

      {showSuggestion ? (
        <div className="mt-2">
          <CodeSuggestionEditor
            value={suggestion}
            onChange={setSuggestion}
            originalCode={originalCode}
            filePath={draft.filePath}
            lineNumber={draft.lineNumber}
          />
        </div>
      ) : null}

      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] text-text-tertiary">
          {commentLength > 0 ? `${commentLength} chars` : "Empty comment"}
        </span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-2.5 py-1 text-xs text-text-tertiary transition-colors hover:bg-surface-overlay hover:text-text-secondary focus-visible:bg-surface-overlay focus-visible:text-text-secondary focus-visible:outline-none"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={trimmedValue.length === 0 || submitting}
            className={cn(
              "rounded bg-accent-primary px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40 disabled:cursor-not-allowed disabled:opacity-40",
              submitting && "pointer-events-none"
            )}
          >
            {submitting ? "Posting…" : "Comment"}
          </button>
        </div>
      </div>
    </form>
  );
};
