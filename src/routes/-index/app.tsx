import { CreateTodoForm } from "./create-todo-form";
import { TodoList } from "./todo-list";

export function App() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-gray-900 dark:text-gray-100 transition-colors duration-200">
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">Todo App</h1>
        <CreateTodoForm />
        <TodoList />
      </div>
    </div>
  );
}
