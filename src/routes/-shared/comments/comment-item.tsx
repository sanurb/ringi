import type { Comment } from "@/api/schemas/comment";

export function CommentItem({
  comment,
  onResolve,
  onUnresolve,
  onDelete,
}: {
  comment: Comment;
  onResolve: (id: string) => void;
  onUnresolve: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const initials = comment.id.slice(0, 2).toUpperCase();

  return (
    <div
      className={`rounded-lg border border-gray-800 bg-surface-elevated p-4 ${comment.resolved ? "opacity-60" : ""}`}
    >
      <div className="flex items-start gap-3">
        {/* Avatar placeholder */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-purple/30 text-xs font-bold text-accent-purple">
          {initials}
        </div>

        <div className="min-w-0 flex-1">
          {/* Header row */}
          <div className="flex items-center gap-2">
            {comment.filePath && (
              <span className="truncate rounded bg-surface-card px-1.5 py-0.5 font-mono text-xs text-gray-400">
                {comment.filePath}
                {comment.lineNumber != null && `:${comment.lineNumber}`}
              </span>
            )}
            {comment.resolved && (
              <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400">
                Resolved
              </span>
            )}
            <span className="ml-auto shrink-0 text-xs text-gray-600">
              {comment.createdAt}
            </span>
          </div>

          {/* Content */}
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-300">
            {comment.content}
          </p>

          {/* Suggestion */}
          {comment.suggestion && (
            <div className="mt-3 rounded border border-accent-cyan/20 bg-surface-primary p-3">
              <span className="mb-1 block text-xs font-medium text-accent-cyan">
                Suggestion
              </span>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-gray-300">
                {comment.suggestion}
              </pre>
            </div>
          )}

          {/* Actions */}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                comment.resolved
                  ? onUnresolve(comment.id)
                  : onResolve(comment.id)
              }
              className="rounded px-2 py-1 text-xs text-gray-400 transition hover:bg-surface-card hover:text-gray-200"
            >
              {comment.resolved ? "Unresolve" : "Resolve"}
            </button>
            <button
              type="button"
              onClick={() => onDelete(comment.id)}
              className="rounded px-2 py-1 text-xs text-gray-500 transition hover:bg-red-500/10 hover:text-red-400"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
