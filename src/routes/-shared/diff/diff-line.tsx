import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "@tanstack/react-router";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import { cn } from "@/lib/utils";
import { clientRuntime } from "@/lib/client-runtime";
import { ApiClient } from "@/api/api-client";
import type { ReviewId } from "@/api/schemas/review";
import type { DiffLine as DiffLineType } from "@/api/schemas/diff";

/**
 * Composite key that uniquely identifies a comment target in a diff.
 * Encodes both the line number and the line type so that split-view
 * left (removed/context) and right (added/context) sides never collide.
 */
export type CommentLineKey = `${number}:${DiffLineType["type"]}`;

export function makeCommentLineKey(
  lineNumber: number,
  lineType: DiffLineType["type"],
): CommentLineKey {
  return `${lineNumber}:${lineType}`;
}

const bgClass: Record<DiffLineType["type"], string> = {
  added: "bg-diff-add-bg border-l-2 border-diff-add-border",
  removed: "bg-diff-remove-bg border-l-2 border-diff-remove-border",
  context: "",
};

const numClass: Record<DiffLineType["type"], string> = {
  added: "text-diff-add-text/60",
  removed: "text-diff-remove-text/60",
  context: "text-text-tertiary",
};

const prefixChar: Record<DiffLineType["type"], string> = {
  added: "+",
  removed: "-",
  context: " ",
};

// ── Inline Comment Form ──────────────────────────────────────────────

function InlineCommentForm({
  filePath,
  lineNumber,
  lineType,
  reviewId,
  onCancel,
  onSubmitted,
}: {
  filePath: string;
  lineNumber: number;
  lineType: DiffLineType["type"];
  reviewId: string;
  onCancel: () => void;
  onSubmitted: () => void;
}) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(() => {
    if (!value.trim() || submitting) return;
    setSubmitting(true);
    setError(null);

    clientRuntime.runFork(
      Effect.gen(function* () {
        const { http } = yield* ApiClient;
        return yield* http.comments.create({
          path: { reviewId: reviewId as ReviewId },
          payload: {
            filePath,
            lineNumber,
            lineType,
            content: value.trim(),
            suggestion: null,
          },
        });
      }).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            onSubmitted();
            void router.invalidate();
          }),
        ),
        Effect.tapErrorCause((cause) =>
          Effect.sync(() => setError(Cause.pretty(cause))),
        ),
        Effect.ensuring(Effect.sync(() => setSubmitting(false))),
      ),
    );
  }, [value, submitting, reviewId, filePath, lineNumber, lineType, onSubmitted, router]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Cmd/Ctrl+Enter to submit
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
        return;
      }
      // Escape to cancel
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    },
    [handleSubmit, onCancel],
  );

  return (
    <div className="col-span-full border-t border-border-subtle bg-surface-overlay px-4 py-2 animate-in fade-in slide-in-from-top-1 duration-150">
      {/* Line context label */}
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="rounded bg-accent-muted px-1.5 py-0.5 font-mono text-[10px] text-accent-primary">
          L{lineNumber}
        </span>
        <span className="text-[10px] text-text-tertiary truncate">
          {filePath}
        </span>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Write a comment… (Cmd+Enter to submit, Esc to cancel)"
        rows={3}
        className="w-full resize-none rounded-sm border border-border-default bg-surface-primary p-2 font-mono text-xs text-text-primary placeholder:text-text-tertiary/60 focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary/30 transition-colors"
      />
      {error && (
        <p className="mt-1 text-xs text-status-error">{error}</p>
      )}
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-[10px] text-text-tertiary">
          {value.trim() ? `${value.trim().length} chars` : ""}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-2.5 py-1 text-xs text-text-tertiary hover:text-text-secondary hover:bg-surface-overlay transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!value.trim() || submitting}
            className="rounded px-2.5 py-1 text-xs font-medium bg-accent-primary text-white hover:bg-accent-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Posting…" : "Comment"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Gutter Button ────────────────────────────────────────────────────

function GutterAddButton({
  onClick,
  isActive,
}: {
  onClick: () => void;
  isActive: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label="Add comment on this line"
      className={cn(
        "absolute left-0 top-0 z-10 flex h-full w-8 items-center justify-center transition-opacity",
        // Stay visible when comment is active for this line; otherwise show on hover
        isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100",
      )}
    >
      <span
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium text-white transition-all",
          isActive
            ? "bg-accent-primary-hover scale-110 shadow-sm shadow-accent-primary/30"
            : "bg-accent-primary hover:bg-accent-primary-hover hover:scale-110 active:scale-95",
        )}
      >
        +
      </span>
    </button>
  );
}

// ── DiffLine ─────────────────────────────────────────────────────────

export function DiffLine({
  line,
  showOldLine = true,
  showNewLine = true,
  mode = "unified",
  highlightedHtml,
  onAddComment,
  activeCommentLine,
  reviewId,
  filePath,
}: {
  line: DiffLineType;
  showOldLine?: boolean;
  showNewLine?: boolean;
  mode?: "split" | "unified";
  highlightedHtml?: string;
  onAddComment?: (lineNumber: number, lineType: DiffLineType["type"]) => void;
  activeCommentLine?: CommentLineKey | null;
  reviewId?: string;
  filePath?: string;
}) {
  const lineNumber = line.newLineNumber ?? line.oldLineNumber ?? 0;
  const commentKey = makeCommentLineKey(lineNumber, line.type);
  const isCommentActive = activeCommentLine === commentKey;

  return (
    <>
      <div
        className={cn(
          "group relative flex font-mono text-xs leading-6 transition-colors",
          bgClass[line.type],
          // Highlight the active comment line with a distinct background
          isCommentActive
            ? "bg-code-line-active ring-1 ring-inset ring-accent-primary/20"
            : "hover:bg-code-line-hover",
        )}
      >
        {/* Gutter comment button */}
        {onAddComment ? (
          <GutterAddButton
            onClick={() => onAddComment(lineNumber, line.type)}
            isActive={isCommentActive}
          />
        ) : (
          // Decorative-only when no review context — fully inert
          <span
            aria-hidden
            className="absolute left-0 top-0 flex h-full w-6 items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent-primary/50 text-[10px] text-white/60">
              +
            </span>
          </span>
        )}

        {showOldLine && (
          <span
            className={cn(
              "w-10 shrink-0 select-none text-right pr-2 text-[10px] leading-6",
              numClass[line.type],
            )}
          >
            {line.oldLineNumber ?? ""}
          </span>
        )}
        {showNewLine && (
          <span
            className={cn(
              "w-10 shrink-0 select-none text-right pr-2 text-[10px] leading-6",
              numClass[line.type],
            )}
          >
            {line.newLineNumber ?? ""}
          </span>
        )}
        {mode === "unified" && (
          <span className="shrink-0 w-4 select-none text-center text-text-tertiary">
            {prefixChar[line.type]}
          </span>
        )}
        {highlightedHtml ? (
          <span
            className="flex-1 whitespace-pre-wrap break-all pl-2 [&_.line]:inline"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        ) : (
          <pre className="flex-1 whitespace-pre-wrap break-all pl-2 text-text-primary">
            {line.content}
          </pre>
        )}
      </div>
      {isCommentActive && reviewId && filePath && (
        <InlineCommentForm
          filePath={filePath}
          lineNumber={lineNumber}
          lineType={line.type}
          reviewId={reviewId}
          onCancel={() => onAddComment?.(lineNumber, line.type)}
          onSubmitted={() => onAddComment?.(lineNumber, line.type)}
        />
      )}
    </>
  );
}

/** Placeholder for empty side in split view */
export function DiffLinePlaceholder() {
  return <div className="flex h-6 bg-surface-inset" />;
}
