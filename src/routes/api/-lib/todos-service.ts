import * as Option from "effect/Option";
import * as DateTime from "effect/DateTime";
import * as Ref from "effect/Ref";
import * as Effect from "effect/Effect";
import {
  CreateTodoInput,
  Todo,
  TodoId,
  TodoNotFound,
  UpdateTodoInput,
} from "@/api/todo-schema";

export class TodosService extends Effect.Service<TodosService>()(
  "TodosService",
  {
    effect: Effect.gen(function* () {
      const todosRef = yield* Ref.make<Map<TodoId, Todo>>(new Map());

      const generateId = (): TodoId => {
        const id = crypto.randomUUID();
        return id as TodoId;
      };

      const list = Effect.gen(function* () {
        const todos = yield* Ref.get(todosRef);
        return Array.from(todos.values());
      });

      const getById = (id: TodoId) =>
        Effect.gen(function* () {
          const todos = yield* Ref.get(todosRef);
          const todo = todos.get(id);
          if (!todo) {
            return yield* new TodoNotFound({ id });
          }
          return todo;
        });

      const create = (input: CreateTodoInput) =>
        Effect.gen(function* () {
          const id = generateId();
          const now = yield* DateTime.now;
          const todo: Todo = {
            id,
            title: input.title,
            completed: false,
            createdAt: now,
          };
          yield* Ref.update(todosRef, (todos) => {
            const newTodos = new Map(todos);
            newTodos.set(id, todo);
            return newTodos;
          });
          return todo;
        });

      const update = (id: TodoId, input: UpdateTodoInput) =>
        Effect.gen(function* () {
          const existing = yield* getById(id);
          const updated: Todo = {
            ...existing,
            title: Option.getOrElse(input.title, () => existing.title),
            completed: Option.getOrElse(
              input.completed,
              () => existing.completed,
            ),
          };
          yield* Ref.update(todosRef, (todos) => {
            const newTodos = new Map(todos);
            newTodos.set(id, updated);
            return newTodos;
          });
          return updated;
        });

      const remove = (id: TodoId) =>
        Effect.gen(function* () {
          yield* getById(id);
          yield* Ref.update(todosRef, (todos) => {
            const newTodos = new Map(todos);
            newTodos.delete(id);
            return newTodos;
          });
        });

      return {
        list,
        getById,
        create,
        update,
        remove,
      } as const;
    }),
  },
) {}
