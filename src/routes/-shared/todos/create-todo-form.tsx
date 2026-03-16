import { useState } from "react";
import * as Effect from "effect/Effect";
import { clientRuntime } from "@/lib/client-runtime";
import { ApiClient } from "@/api/api-client";
import type { Todo } from "@/api/schemas/todo";

interface CreateTodoFormProps {
  onCreated: (todo: Todo) => void;
}

export function CreateTodoForm({ onCreated }: CreateTodoFormProps) {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    clientRuntime.runFork(
      Effect.gen(function* () {
        const { http } = yield* ApiClient;
        return yield* http.todos.create({
          payload: { content: trimmed, reviewId: null },
        });
      }).pipe(
        Effect.tap((todo) =>
          Effect.sync(() => {
            setContent("");
            onCreated(todo);
          }),
        ),
        Effect.catchAllCause(() => Effect.void),
        Effect.ensuring(Effect.sync(() => setSubmitting(false))),
      ),
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 px-4">
      <input
        type="text"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Add a todo..."
        className="flex-1 rounded-md border border-border-default bg-surface-primary px-3 py-1.5 text-sm text-text-primary placeholder-text-tertiary outline-none focus:border-accent-primary"
        disabled={submitting}
      />
      <button
        type="submit"
        disabled={!content.trim() || submitting}
        className="rounded-md bg-accent-muted px-3 py-1.5 text-sm font-medium text-accent-primary hover:bg-accent-muted disabled:opacity-40"
      >
        Add
      </button>
    </form>
  );
}
