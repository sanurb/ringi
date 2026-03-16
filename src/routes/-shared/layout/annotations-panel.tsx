import { cn } from "@/lib/utils";
import type { Comment } from "@/api/schemas/comment";

interface AnnotationsPanelProps {
  comments: ReadonlyArray<Comment>;
  selectedFile: string | null;
  reviewId: string;
  isOpen: boolean;
}

function groupByFile(
  comments: ReadonlyArray<Comment>,
): ReadonlyArray<[filePath: string, comments: ReadonlyArray<Comment>]> {
  const groups = new Map<string, Array<Comment>>();
  for (const comment of comments) {
    const existing = groups.get(comment.filePath);
    if (existing) {
      existing.push(comment);
    } else {
      groups.set(comment.filePath, [comment]);
    }
  }
  return Array.from(groups.entries());
}

function SpeechBubbleIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-text-tertiary"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4">
      <SpeechBubbleIcon />
      <p className="text-center text-xs text-text-tertiary">
        Click on lines to add annotations
      </p>
    </div>
  );
}

function CommentCard({ comment }: { comment: Comment }) {
  return (
    <div className="flex flex-col gap-1 rounded border border-border-subtle bg-surface-elevated px-2.5 py-2">
      {comment.lineNumber != null && (
        <span className="font-mono text-[10px] text-text-tertiary">
          L{comment.lineNumber}
        </span>
      )}
      <p className="whitespace-pre-wrap text-xs text-text-secondary">
        {comment.content}
      </p>
      {comment.resolved && (
        <span className="text-[10px] text-status-success">Resolved</span>
      )}
    </div>
  );
}

function FileGroup({
  filePath,
  comments,
}: {
  filePath: string;
  comments: ReadonlyArray<Comment>;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="truncate font-mono text-[10px] text-text-tertiary">
        {filePath}
      </span>
      {comments.map((comment) => (
        <CommentCard key={comment.id} comment={comment} />
      ))}
    </div>
  );
}

export function AnnotationsPanel({
  comments,
  isOpen,
}: AnnotationsPanelProps) {
  if (!isOpen) return null;

  const groups = groupByFile(comments);

  return (
    <aside
      className={cn(
        "flex w-64 shrink-0 flex-col border-l border-border-default bg-surface-secondary",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2.5">
        <span className="text-[10px] font-medium uppercase tracking-widest text-text-tertiary">
          Annotations
        </span>
        <span className="rounded-full bg-surface-overlay px-1.5 text-[10px] text-text-secondary">
          {comments.length}
        </span>
      </div>

      {/* Body */}
      {comments.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
          {groups.map(([filePath, fileComments]) => (
            <FileGroup
              key={filePath}
              filePath={filePath}
              comments={fileComments}
            />
          ))}
        </div>
      )}
    </aside>
  );
}
