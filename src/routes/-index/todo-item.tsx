import type { Todo } from "@/api/todo-schema";
import { Result, useAtom, useAtomRefresh } from "@effect-atom/atom-react";
import * as Option from "effect/Option";
import { useState } from "react";
import { deleteTodoAtom, todosAtom, updateTodoAtom } from "./atoms";

export function TodoItem({ todo }: { readonly todo: Todo }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(todo.title);
  const [updateResult, update] = useAtom(updateTodoAtom);
  const [deleteResult, deleteTodo] = useAtom(deleteTodoAtom);
  const refreshTodos = useAtomRefresh(todosAtom);

  const handleToggle = () => {
    update({
      id: todo.id,
      input: { title: Option.none(), completed: Option.some(!todo.completed) },
    });
  };

  const handleDelete = () => {
    deleteTodo(todo.id);
  };

  const handleSaveEdit = () => {
    if (!editTitle.trim()) return;
    update({
      id: todo.id,
      input: { title: Option.some(editTitle.trim()), completed: Option.none() },
    });
    setIsEditing(false);
  };

  const isLoading = updateResult.waiting || deleteResult.waiting;
  const hasError =
    Result.isFailure(updateResult) || Result.isFailure(deleteResult);

  return (
    <li
      className={`p-4 rounded-lg border-2 transition-colors ${
        hasError
          ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950"
          : "border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 hover:border-gray-300 dark:hover:border-gray-600"
      } ${isLoading ? "opacity-50" : ""}`}
    >
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={todo.completed}
          onChange={handleToggle}
          disabled={isLoading}
          className="w-5 h-5 rounded border-gray-300 dark:border-gray-600 text-blue-500 dark:text-blue-400 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-slate-800"
        />
        {isEditing ? (
          <div className="flex-1 flex gap-2">
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveEdit();
                if (e.key === "Escape") {
                  setIsEditing(false);
                  setEditTitle(todo.title);
                }
              }}
              autoFocus
              className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
            />
            <button
              onClick={handleSaveEdit}
              disabled={isLoading}
              className="px-3 py-1 bg-green-500 dark:bg-green-600 text-white rounded hover:bg-green-600 dark:hover:bg-green-700 disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => {
                setIsEditing(false);
                setEditTitle(todo.title);
              }}
              className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <span
              className={`flex-1 cursor-pointer ${
                todo.completed
                  ? "line-through text-gray-400 dark:text-gray-500"
                  : "text-gray-900 dark:text-gray-100"
              }`}
              onDoubleClick={() => setIsEditing(true)}
            >
              {todo.title}
            </span>
            <button
              onClick={() => setIsEditing(true)}
              disabled={isLoading}
              className="px-3 py-1 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded disabled:opacity-50"
            >
              Edit
            </button>
            <button
              onClick={handleDelete}
              disabled={isLoading}
              className="px-3 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 rounded disabled:opacity-50"
            >
              {deleteResult.waiting ? "..." : "Delete"}
            </button>
          </>
        )}
      </div>
      {hasError && (
        <div className="mt-2 text-sm text-red-600 dark:text-red-400">
          Operation failed.{" "}
          <button
            onClick={refreshTodos}
            className="underline hover:no-underline"
          >
            Refresh
          </button>
        </div>
      )}
    </li>
  );
}
