import type { Todo } from "@ringi/core/schemas/todo";

interface TodoItemProps {
  todo: Todo;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TodoItem({ todo, onToggle, onDelete }: TodoItemProps) {
  return (
    <div className="group flex items-center gap-3 rounded-md px-3 py-2 hover:bg-surface-elevated">
      <button
        type="button"
        onClick={() => onToggle(todo.id)}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
          todo.completed
            ? "border-accent-primary bg-accent-muted text-accent-primary"
            : "border-border-strong text-transparent hover:border-text-secondary"
        }`}
        aria-label={todo.completed ? "Mark incomplete" : "Mark complete"}
      >
        {todo.completed && (
          <svg
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        )}
      </button>

      <span
        className={`min-w-0 flex-1 break-words text-sm ${
          todo.completed
            ? "text-text-tertiary line-through"
            : "text-text-primary"
        }`}
      >
        {todo.content}
      </span>

      <button
        type="button"
        onClick={() => onDelete(todo.id)}
        className="shrink-0 text-text-tertiary opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
        aria-label="Delete todo"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}
