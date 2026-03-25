import { useState, useCallback } from "react";

import type { Comment } from "@/api/schemas/comment";

import { CommentForm } from "./comment-form";
import { CommentItem } from "./comment-item";

export function CommentList({
  reviewId,
  filePath,
  comments: initialComments,
}: {
  reviewId: string;
  filePath: string;
  comments: Comment[];
}) {
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [showForm, setShowForm] = useState(false);

  const resolved = comments.filter((c) => c.resolved).length;

  const handleResolve = useCallback(async (id: string) => {
    const res = await fetch(`/api/comments/${id}/resolve`, { method: "POST" });
    if (!res.ok) {
      return;
    }
    setComments((prev) =>
      prev.map((c) => (c.id === id ? { ...c, resolved: true } : c))
    );
  }, []);

  const handleUnresolve = useCallback(async (id: string) => {
    const res = await fetch(`/api/comments/${id}/unresolve`, {
      method: "POST",
    });
    if (!res.ok) {
      return;
    }
    setComments((prev) =>
      prev.map((c) => (c.id === id ? { ...c, resolved: false } : c))
    );
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
    if (!res.ok) {
      return;
    }
    setComments((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const handleSubmit = useCallback((created: Comment) => {
    setComments((prev) => [...prev, created]);
    setShowForm(false);
  }, []);

  // Group comments by line number (null = file-level)
  const grouped = new Map<string, Comment[]>();
  for (const c of comments) {
    const key = c.lineNumber != null ? `L${c.lineNumber}` : "file";
    const arr = grouped.get(key);
    if (arr) {
      arr.push(c);
    } else {
      grouped.set(key, [c]);
    }
  }

  return (
    <div className="space-y-4">
      {comments.length > 0 ? (
        <div className="flex items-center gap-3 text-xs text-text-tertiary">
          <span>{comments.length} comments</span>
          {resolved > 0 ? (
            <span className="text-status-success">{resolved} resolved</span>
          ) : null}
        </div>
      ) : null}

      {/* Comments grouped by line */}
      {[...grouped.entries()].map(([key, group]) => (
        <div key={key} className="space-y-2">
          <span className="text-xs font-medium text-text-tertiary">
            {key === "file" ? "File-level" : key}
          </span>
          {group.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              onResolve={handleResolve}
              onUnresolve={handleUnresolve}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ))}

      {/* Add comment */}
      {showForm ? (
        <CommentForm
          reviewId={reviewId}
          filePath={filePath}
          onSubmit={handleSubmit}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="rounded bg-surface-overlay px-3 py-1.5 text-xs text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
        >
          + Add comment
        </button>
      )}
    </div>
  );
}
