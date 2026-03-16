import { useState } from "react";

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
  onSubmit: (comment: any) => void;
  onCancel?: () => void;
}) {
  const [content, setContent] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/reviews/${reviewId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath,
          lineNumber: lineNumber ?? null,
          lineType: lineType ?? null,
          content: content.trim(),
          suggestion: showSuggestion && suggestion.trim() ? suggestion.trim() : null,
        }),
      });
      if (!res.ok) throw new Error(`Failed to create comment: ${res.status}`);
      const created = await res.json();
      onSubmit(created);
      setContent("");
      setSuggestion("");
      setShowSuggestion(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-gray-800 bg-surface-elevated p-4"
    >
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write a comment..."
        rows={3}
        className="w-full resize-y rounded border border-gray-700 bg-surface-primary px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-accent-cyan focus:outline-none"
      />

      {/* Suggestion toggle */}
      <button
        type="button"
        onClick={() => setShowSuggestion(!showSuggestion)}
        className="mt-2 text-xs text-gray-400 transition hover:text-accent-cyan"
      >
        {showSuggestion ? "− Remove suggestion" : "+ Add suggestion"}
      </button>

      {showSuggestion && (
        <textarea
          value={suggestion}
          onChange={(e) => setSuggestion(e.target.value)}
          placeholder="Suggested code change..."
          rows={3}
          className="mt-2 w-full resize-y rounded border border-gray-700 bg-surface-primary px-3 py-2 font-mono text-xs text-gray-200 placeholder-gray-500 focus:border-accent-cyan focus:outline-none"
        />
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting || !content.trim()}
          className="rounded bg-accent-cyan/20 px-3 py-1.5 text-xs font-medium text-accent-cyan transition hover:bg-accent-cyan/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Posting..." : "Comment"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-xs text-gray-400 transition hover:bg-surface-card hover:text-gray-200"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
