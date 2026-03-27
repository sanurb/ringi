import { useCallback, useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

import type {
  AnnotationEntry,
  CopyStatus,
  FileAnnotationGroup,
} from "./use-annotations-panel";

// ---------------------------------------------------------------------------
// Motion tokens (matching action-bar.tsx / file-tree.tsx conventions)
// ---------------------------------------------------------------------------

const EASE_OUT = "[transition-timing-function:cubic-bezier(0.23,1,0.32,1)]";
const pressScale = "active:scale-[0.97]";

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

const formatRelativeTime = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) {
    return "just now";
  }
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(date);
};

// ---------------------------------------------------------------------------
// File name extraction
// ---------------------------------------------------------------------------

const getFileName = (filePath: string): string => {
  const parts = filePath.split("/");
  return parts.at(-1) ?? filePath;
};

const getDirPath = (filePath: string): string => {
  const parts = filePath.split("/");
  if (parts.length <= 1) {
    return "";
  }
  return parts.slice(0, -1).join("/");
};

// ---------------------------------------------------------------------------
// Delete button (hover/focus revealed)
// ---------------------------------------------------------------------------

const DeleteButton = ({
  onDelete,
  annotationId,
}: {
  onDelete: (id: string) => void;
  annotationId: string;
}) => {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete(annotationId);
    },
    [onDelete, annotationId]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        onDelete(annotationId);
      }
    },
    [onDelete, annotationId]
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label="Delete annotation"
      tabIndex={0}
      className={cn(
        "ml-auto shrink-0 rounded px-1 py-0.5 text-text-quaternary",
        "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
        "transition-[opacity,color,background-color] duration-100",
        EASE_OUT,
        "hover:bg-status-error/10 hover:text-status-error",
        "focus-visible:bg-status-error/10 focus-visible:text-status-error focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-status-error/30",
        "active:scale-[0.93]",
        "motion-reduce:transform-none"
      )}
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        className="shrink-0"
      >
        <path d="M2 3h8M4.5 3V2a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1M5 5.5v3M7 5.5v3M3 3l.5 7a1 1 0 0 0 1 .9h3a1 1 0 0 0 1-.9L9 3" />
      </svg>
    </button>
  );
};

// ---------------------------------------------------------------------------
// Annotation card
// ---------------------------------------------------------------------------

const AnnotationCard = ({
  entry,
  onClick,
  onDelete,
}: {
  entry: AnnotationEntry;
  onClick: (entry: AnnotationEntry) => void;
  onDelete: (id: string) => void;
}) => {
  const handleClick = useCallback(() => onClick(entry), [entry, onClick]);
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick(entry);
      }
    },
    [entry, onClick]
  );

  const linePrefix = entry.lineType === "added" ? "+" : "-";
  const lineColor =
    entry.lineType === "added" ? "text-diff-add-text" : "text-diff-remove-text";

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "group flex w-full cursor-pointer flex-col rounded-md px-2.5 py-2 text-left",
        "transition-[background-color,transform] duration-150",
        EASE_OUT,
        pressScale,
        "hover:bg-surface-overlay/60",
        "focus-visible:bg-surface-overlay/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-primary/40",
        "motion-reduce:transform-none"
      )}
    >
      {/* Line reference + delete + timestamp */}
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "rounded bg-surface-primary/80 px-1 py-px font-mono text-[10px] font-medium tabular-nums",
            lineColor
          )}
        >
          {linePrefix}L{entry.lineNumber}
        </span>
        <DeleteButton onDelete={onDelete} annotationId={entry.id} />
        <span className="text-[10px] text-text-quaternary">
          {formatRelativeTime(entry.createdAt)}
        </span>
      </div>

      {/* Comment preview */}
      <p className="mt-1 line-clamp-2 text-[11px] leading-[16px] text-text-secondary group-hover:text-text-primary">
        {entry.content}
      </p>

      {/* Suggestion indicator */}
      {entry.suggestion ? (
        <div className="mt-1 flex items-center text-[10px] text-accent-primary/70">
          <svg
            width="10"
            height="10"
            viewBox="0 0 14 14"
            fill="none"
            className="shrink-0"
          >
            <path
              d="M3 5l2.5 2.5L11 2M3 9h8"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      ) : null}
    </button>
  );
};

// ---------------------------------------------------------------------------
// File group
// ---------------------------------------------------------------------------

const FileGroup = ({
  group,
  onAnnotationClick,
  onDeleteAnnotation,
}: {
  group: FileAnnotationGroup;
  onAnnotationClick: (entry: AnnotationEntry) => void;
  onDeleteAnnotation: (id: string) => void;
}) => {
  const fileName = getFileName(group.filePath);
  const dirPath = getDirPath(group.filePath);

  return (
    <div className="py-1">
      {/* File header */}
      <div className="flex items-center gap-1.5 px-3 py-1.5">
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="shrink-0 text-text-quaternary"
        >
          <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h3.379a1.5 1.5 0 0 1 1.06.44l.622.621a.5.5 0 0 0 .353.146H12.5A1.5 1.5 0 0 1 14 4.707V12.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5V3.5Z" />
        </svg>
        <span className="min-w-0 truncate font-mono text-[11px] font-medium text-text-primary">
          {fileName}
        </span>
        {dirPath ? (
          <span className="min-w-0 truncate font-mono text-[10px] text-text-quaternary">
            {dirPath}
          </span>
        ) : null}
        <span className="ml-auto shrink-0 rounded-full bg-surface-overlay px-1.5 py-px text-[10px] tabular-nums text-text-tertiary">
          {group.annotations.length}
        </span>
      </div>

      {/* Annotations */}
      <div className="space-y-0.5 px-1">
        {group.annotations.map((entry) => (
          <AnnotationCard
            key={entry.id}
            entry={entry}
            onClick={onAnnotationClick}
            onDelete={onDeleteAnnotation}
          />
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

const EmptyState = () => (
  <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
    <svg
      width="28"
      height="28"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="text-text-quaternary/40"
    >
      <path d="M1 3.5A2.5 2.5 0 0 1 3.5 1h9A2.5 2.5 0 0 1 15 3.5v6a2.5 2.5 0 0 1-2.5 2.5H9l-3.5 3v-3H3.5A2.5 2.5 0 0 1 1 9.5v-6Z" />
    </svg>
  </div>
);

// ---------------------------------------------------------------------------
// Copy feedback icons
// ---------------------------------------------------------------------------

const ClipboardIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.25"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="shrink-0"
  >
    <rect x="5" y="5" width="8" height="8" rx="1.5" />
    <path d="M5 11H4.5A1.5 1.5 0 0 1 3 9.5V4.5A1.5 1.5 0 0 1 4.5 3H9.5A1.5 1.5 0 0 1 11 4.5V5" />
  </svg>
);

const CheckIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 12 12"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="shrink-0 text-status-success"
  >
    <path d="M2.5 6.5L5 9l4.5-6" />
  </svg>
);

const ErrorIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 12 12"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    className="shrink-0 text-status-error"
  >
    <path d="M3 3l6 6M9 3l-6 6" />
  </svg>
);

const COPY_LABELS: Record<CopyStatus, string> = {
  copied: "Copied!",
  error: "Failed",
  idle: "Copy Feedback",
};

// ---------------------------------------------------------------------------
// Copy feedback button
// ---------------------------------------------------------------------------

const COPY_STATUS_STYLES: Record<CopyStatus, string> = {
  copied: "text-status-success",
  error: "text-status-error",
  idle: "text-text-secondary hover:bg-surface-overlay hover:text-text-primary",
};

const CopyStatusIcon = ({ status }: { status: CopyStatus }) => {
  if (status === "copied") {
    return <CheckIcon />;
  }
  if (status === "error") {
    return <ErrorIcon />;
  }
  return <ClipboardIcon />;
};

const CopyFeedbackButton = ({
  copyStatus,
  onCopyFeedback,
}: {
  copyStatus: CopyStatus;
  onCopyFeedback: () => void;
}) => (
  <button
    type="button"
    onClick={onCopyFeedback}
    disabled={copyStatus !== "idle"}
    className={cn(
      "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium",
      "transition-[background-color,color,transform,opacity] duration-150",
      EASE_OUT,
      pressScale,
      COPY_STATUS_STYLES[copyStatus],
      copyStatus !== "idle" && "pointer-events-none",
      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-primary/40",
      "motion-reduce:transform-none"
    )}
  >
    <CopyStatusIcon status={copyStatus} />
    <span>{COPY_LABELS[copyStatus]}</span>
  </button>
);

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

interface AnnotationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  groups: readonly FileAnnotationGroup[];
  totalCount: number;
  copyStatus: CopyStatus;
  onAnnotationClick: (entry: AnnotationEntry) => void;
  onDeleteAnnotation: (id: string) => void;
  onCopyFeedback: () => void;
}

export const AnnotationsPanel = ({
  isOpen,
  onClose,
  groups,
  totalCount,
  copyStatus,
  onAnnotationClick,
  onDeleteAnnotation,
  onCopyFeedback,
}: AnnotationsPanelProps) => {
  const panelRef = useRef<HTMLElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <aside
      ref={panelRef}
      role="complementary"
      aria-label="Annotations"
      className={cn(
        "flex h-full flex-col border-l border-border-default bg-surface-secondary",
        "transition-[width,opacity] duration-200",
        EASE_OUT,
        "motion-reduce:transition-none",
        isOpen ? "w-72 opacity-100" : "w-0 opacity-0 overflow-hidden"
      )}
    >
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex h-10 shrink-0 items-center justify-end border-b border-border-default px-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close annotations panel"
          className={cn(
            "inline-flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary",
            "transition-[background-color,color,transform] duration-150",
            EASE_OUT,
            pressScale,
            "hover:bg-surface-overlay hover:text-text-primary",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-primary/40",
            "motion-reduce:transform-none"
          )}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M3 3l6 6M9 3l-6 6" />
          </svg>
        </button>
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
        {groups.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="divide-y divide-border-subtle">
            {groups.map((group) => (
              <FileGroup
                key={group.filePath}
                group={group}
                onAnnotationClick={onAnnotationClick}
                onDeleteAnnotation={onDeleteAnnotation}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────────── */}
      {totalCount > 0 ? (
        <div className="flex items-center border-t border-border-subtle px-3 py-1.5">
          <CopyFeedbackButton
            copyStatus={copyStatus}
            onCopyFeedback={onCopyFeedback}
          />
        </div>
      ) : null}
    </aside>
  );
};
