import { Result, useAtom } from "@effect-atom/atom-react";
import { useState } from "react";
import { createTodoAtom } from "./atoms";

export function CreateTodoForm() {
  const [title, setTitle] = useState("");
  const [createResult, create] = useAtom(createTodoAtom);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    create({ title: title.trim() });
    setTitle("");
  };

  const hasError = Result.isFailure(createResult);

  return (
    <div className="mb-6">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs to be done?"
          disabled={createResult.waiting}
          className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={createResult.waiting || !title.trim()}
          className="px-4 py-2 bg-blue-500 dark:bg-blue-600 text-white rounded-lg hover:bg-blue-600 dark:hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {createResult.waiting ? "Adding..." : "Add"}
        </button>
      </form>
      {hasError && (
        <div className="mt-2 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-200 text-sm">
          Failed to create todo. Please try again.
        </div>
      )}
    </div>
  );
}
