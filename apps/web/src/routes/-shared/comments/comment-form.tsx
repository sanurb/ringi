import type { Comment } from "@ringi/core/schemas/comment";
import type { ReviewId } from "@ringi/core/schemas/review";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import { useState } from "react";

import { ApiClient } from "@/api/api-client";
import { clientRuntime } from "@/lib/client-runtime";

export function CommentForm({
  reviewId,
  filePath,
  lineNumber,
  lineType,
  onSubmit,
  onCancel,
}: {
  reviewId: string;
  filePath: string;
  lineNumber?: number | null;
  lineType?: string | null;
  onSubmit: (comment: Comment) => void;
  onCancel?: () => void;
}) {
  const [content, setContent] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      return;
    }

    setSubmitting(true);
    clientRuntime.runFork(
      Effect.gen(function* handleSubmit() {
        const { http } = yield* ApiClient;
        return yield* http.comments.create({
          path: { reviewId: reviewId as ReviewId },
          payload: {
            content: content.trim(),
            filePath,
            lineNumber: lineNumber ?? null,
            lineType: (lineType ?? null) as Comment["lineType"],
            suggestion:
              showSuggestion && suggestion.trim() ? suggestion.trim() : null,
          },
        });
      }).pipe(
        Effect.tap((created) =>
          Effect.sync(() => {
            onSubmit(created);
            setContent("");
            setSuggestion("");
            setShowSuggestion(false);
          })
        ),
        Effect.tapErrorCause((cause) =>
          Effect.logError("Failed to create comment", Cause.pretty(cause))
        ),
        Effect.ensuring(Effect.sync(() => setSubmitting(false)))
      )
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-border-default bg-surface-elevated p-4"
    >
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write a comment..."
        rows={3}
        className="w-full resize-y rounded border border-border-default bg-surface-primary px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:border-accent-primary focus:outline-none"
      />

      {/* Suggestion toggle */}
      <button
        type="button"
        onClick={() => setShowSuggestion(!showSuggestion)}
        className="mt-2 text-xs text-text-secondary transition hover:text-accent-primary"
      >
        {showSuggestion ? "− Remove suggestion" : "+ Add suggestion"}
      </button>

      {showSuggestion && (
        <textarea
          value={suggestion}
          onChange={(e) => setSuggestion(e.target.value)}
          placeholder="Suggested code change..."
          rows={3}
          className="mt-2 w-full resize-y rounded border border-border-default bg-surface-primary px-3 py-2 font-mono text-xs text-text-primary placeholder-text-tertiary focus:border-accent-primary focus:outline-none"
        />
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting || !content.trim()}
          className="rounded bg-accent-muted px-3 py-1.5 text-xs font-medium text-accent-primary transition hover:bg-accent-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Posting..." : "Comment"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-xs text-text-secondary transition hover:bg-surface-overlay hover:text-text-primary"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
