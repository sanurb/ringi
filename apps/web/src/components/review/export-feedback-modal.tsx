"use client";

import type { Comment } from "@ringi/core/schemas/comment";
import { CheckIcon, ClipboardIcon, DownloadIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ExportableComment } from "@/lib/format-review-feedback";
import { formatReviewFeedback } from "@/lib/format-review-feedback";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COPY_FEEDBACK_MS = 1800;
const EMPTY_API_COMMENTS: readonly Comment[] = [];
const EMPTY_LOCAL_COMMENTS: readonly ExportableComment[] = [];

const buttonMotionClass =
  "transition-[transform,background-color,color,border-color,box-shadow,opacity] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] motion-reduce:transform-none";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExportFeedbackModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** API-persisted comments (review detail page). */
  comments?: readonly Comment[];
  /** Pre-built exportable comments (changes page / local comments). */
  localComments?: readonly ExportableComment[];
  reviewId?: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const EmptyState = () => (
  <div className="flex flex-col items-center justify-center gap-2 py-12">
    <ClipboardIcon className="size-4 text-text-tertiary" />
    <p className="text-sm text-text-tertiary">No comments to export</p>
  </div>
);

const MarkdownPreview = ({ markdown }: { markdown: string }) => (
  <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border-default bg-surface-inset/40">
    <pre className="h-full overflow-y-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-text-secondary selection:bg-accent-muted">
      {markdown}
    </pre>
  </div>
);

const CopyButton = ({
  copied,
  disabled,
  onClick,
}: {
  copied: boolean;
  disabled: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={cn(
      "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium active:scale-[0.97]",
      buttonMotionClass,
      copied
        ? "bg-status-success/15 text-status-success"
        : "bg-accent-primary text-white hover:bg-accent-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40 disabled:cursor-not-allowed disabled:opacity-40"
    )}
  >
    <span
      className={cn(
        "inline-flex transition-[transform,opacity] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
        copied ? "scale-110" : "scale-100"
      )}
    >
      {copied ? (
        <CheckIcon className="size-3.5" />
      ) : (
        <ClipboardIcon className="size-3.5" />
      )}
    </span>
    {copied ? "Copied!" : "Copy to Clipboard"}
  </button>
);

const DownloadButton = ({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={cn(
      "inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-surface-elevated px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40",
      buttonMotionClass
    )}
  >
    <DownloadIcon className="size-3.5" />
    Download .md
  </button>
);

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

export const ExportFeedbackModal = ({
  open,
  onOpenChange,
  comments = EMPTY_API_COMMENTS,
  localComments = EMPTY_LOCAL_COMMENTS,
  reviewId,
}: ExportFeedbackModalProps) => {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Reset copy state when modal closes
  useEffect(() => {
    if (!open) {
      setCopied(false);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [open]);

  const allComments: readonly ExportableComment[] = useMemo(() => {
    const fromApi: ExportableComment[] = comments.map((c) => ({
      content: c.content,
      filePath: c.filePath,
      lineNumber: c.lineNumber,
      lineType: c.lineType,
      suggestion: c.suggestion,
    }));
    return [...fromApi, ...localComments];
  }, [comments, localComments]);

  const markdown = useMemo(
    () => formatReviewFeedback(allComments),
    [allComments]
  );

  const commentCount = allComments.length;

  const handleCopy = useCallback(async () => {
    if (!markdown) {
      return;
    }

    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    timerRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  }, [markdown]);

  const handleDownload = useCallback(() => {
    if (!markdown) {
      return;
    }

    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = reviewId ? `review-${reviewId}.md` : "review-feedback.md";
    anchor.click();
    URL.revokeObjectURL(url);
  }, [markdown, reviewId]);

  const isEmpty = commentCount === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(640px,calc(100dvh-2rem))] w-full max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export Feedback</DialogTitle>
          {isEmpty ? (
            <DialogDescription>No comments to export.</DialogDescription>
          ) : null}
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
          {isEmpty ? <EmptyState /> : <MarkdownPreview markdown={markdown} />}
        </div>

        {isEmpty ? null : (
          <DialogFooter>
            <DownloadButton disabled={isEmpty} onClick={handleDownload} />
            <CopyButton
              copied={copied}
              disabled={isEmpty}
              onClick={handleCopy}
            />
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};
