import { Result, useAtomRefresh, useAtomValue } from "@effect-atom/atom-react";
import { todosAtom } from "./atoms";
import { TodoItem } from "./todo-item";

export function TodoList() {
  const result = useAtomValue(todosAtom);
  const refreshTodos = useAtomRefresh(todosAtom);

  return (
    <div>
      {Result.builder(result)
        .onInitial(() => (
          <p className="text-gray-500 dark:text-gray-400">Loading todos...</p>
        ))
        .onSuccess((todos) =>
          todos.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">
              No todos yet. Add one above!
            </p>
          ) : (
            <ul className="space-y-2">
              {todos.map((todo) => (
                <TodoItem key={todo.id} todo={todo} />
              ))}
            </ul>
          ),
        )
        .onFailure(() => (
          <div className="p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-700 dark:text-red-200 mb-2">
              Something went wrong loading todos.
            </p>
            <button
              onClick={refreshTodos}
              className="px-3 py-1 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 rounded hover:bg-red-200 dark:hover:bg-red-800"
            >
              Retry
            </button>
          </div>
        ))
        .render()}
    </div>
  );
}
