import { useCallback, useEffect, useRef, useState } from "react";
import type { Todo } from "@/api/schemas/todo";
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
  const [stats, setStats] = useState<TodoStats>({ total: 0, completed: 0, pending: 0 });
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
    if (isOpen) fetchTodos();
  }, [isOpen, fetchTodos]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  async function handleToggle(id: string) {
    const res = await fetch(`/api/todos/${id}/toggle`, { method: "PATCH" });
    if (res.ok) fetchTodos();
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/todos/${id}`, { method: "DELETE" });
    if (res.ok) fetchTodos();
  }

  async function handleClearCompleted() {
    const res = await fetch("/api/todos/completed", { method: "DELETE" });
    if (res.ok) fetchTodos();
  }

  function handleCreated(_todo: any) {
    fetchTodos();
  }

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 transition-opacity"
          onClick={onClose}
          aria-hidden
        />
      )}

      {/* Panel */}
      <div
        ref={panelRef}
        className={`fixed inset-y-0 right-0 z-50 w-80 transform border-l border-gray-800 bg-surface-secondary shadow-xl transition-transform duration-200 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-200">Todos</h2>
            <p className="text-xs text-gray-500">
              {stats.completed} completed / {stats.total} total
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300"
            aria-label="Close panel"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Create form */}
        <div className="border-b border-gray-800 py-3">
          <CreateTodoForm onCreated={handleCreated} />
        </div>

        {/* Todo list */}
        <div className="flex-1 overflow-y-auto px-1 py-2" style={{ maxHeight: "calc(100vh - 160px)" }}>
          {todos.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500">No todos yet</p>
          ) : (
            todos.map((todo) => (
              <TodoItem key={todo.id} todo={todo} onToggle={handleToggle} onDelete={handleDelete} />
            ))
          )}
        </div>

        {/* Footer */}
        {stats.completed > 0 && (
          <div className="border-t border-gray-800 px-4 py-3">
            <button
              type="button"
              onClick={handleClearCompleted}
              className="w-full rounded-md bg-red-500/10 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/20"
            >
              Clear completed ({stats.completed})
            </button>
          </div>
        )}
      </div>
    </>
  );
}
