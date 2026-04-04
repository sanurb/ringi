import type { Todo } from "@ringi/core/schemas/todo";
import { useCallback, useEffect, useRef, useState } from "react";

import { CreateTodoForm } from "./create-todo-form";
import { TodoItem } from "./todo-item";

interface TodoPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TodoStats {
  total: number;
  completed: number;
  pending: number;
}

export function TodoPanel({ isOpen, onClose }: TodoPanelProps) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [stats, setStats] = useState<TodoStats>({
    completed: 0,
    pending: 0,
    total: 0,
  });
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchTodos = useCallback(async () => {
    const [todosRes, statsRes] = await Promise.all([
      fetch("/api/todos"),
      fetch("/api/todos/stats"),
    ]);
    if (todosRes.ok) {
      const body = await todosRes.json();
      setTodos(body.data ?? []);
    }
    if (statsRes.ok) {
      setStats(await statsRes.json());
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchTodos();
    }
  }, [isOpen, fetchTodos]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  async function handleToggle(id: string) {
    const res = await fetch(`/api/todos/${id}/toggle`, { method: "PATCH" });
    if (res.ok) {
      fetchTodos();
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/todos/${id}`, { method: "DELETE" });
    if (res.ok) {
      fetchTodos();
    }
  }

  async function handleClearCompleted() {
    const res = await fetch("/api/todos/completed", { method: "DELETE" });
    if (res.ok) {
      fetchTodos();
    }
  }

  function handleCreated(_todo: Todo) {
    fetchTodos();
  }

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]"
          onClick={onClose}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              onClose();
            }
          }}
          role="button"
          tabIndex={-1}
          aria-label="Close panel"
        />
      )}

      {/* Panel */}
      <div
        ref={panelRef}
        className={`fixed inset-y-0 right-0 z-50 w-80 border-l border-border-default bg-surface-secondary shadow-xl transition-transform duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-text-primary">Todos</h2>
            {stats.total > 0 ? (
              <span className="rounded-full bg-surface-overlay px-1.5 py-px text-[10px] font-medium tabular-nums text-text-secondary">
                {stats.completed}/{stats.total}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary"
            aria-label="Close panel"
          >
            <svg
              className="h-5 w-5"
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

        {/* Create form */}
        <div className="border-b border-border-default py-3">
          <CreateTodoForm onCreated={handleCreated} />
        </div>

        {/* Todo list */}
        <div
          className="flex-1 overflow-y-auto px-1 py-2"
          style={{ maxHeight: "calc(100vh - 160px)" }}
        >
          {todos.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-text-tertiary">
              No todos yet
            </p>
          ) : (
            todos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>

        {/* Footer */}
        {stats.completed > 0 && (
          <div className="border-t border-border-default px-4 py-3">
            <button
              type="button"
              onClick={handleClearCompleted}
              className="w-full rounded-md bg-red-500/10 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/20"
            >
              Clear done
            </button>
          </div>
        )}
      </div>
    </>
  );
}
