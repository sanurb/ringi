import { useState } from "react";

interface CreateTodoFormProps {
  onCreated: (todo: any) => void;
}

export function CreateTodoForm({ onCreated }: CreateTodoFormProps) {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      });
      if (!res.ok) return;
      const todo = await res.json();
      setContent("");
      onCreated(todo);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 px-4">
      <input
        type="text"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Add a todo..."
        className="flex-1 rounded-md border border-gray-700 bg-surface-primary px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-accent-cyan"
        disabled={submitting}
      />
      <button
        type="submit"
        disabled={!content.trim() || submitting}
        className="rounded-md bg-accent-cyan/20 px-3 py-1.5 text-sm font-medium text-accent-cyan hover:bg-accent-cyan/30 disabled:opacity-40"
      >
        Add
      </button>
    </form>
  );
}
