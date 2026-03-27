import { randomUUID } from "node:crypto";

import { ServiceMap } from "effect";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { TodoRepo } from "../repos/todo.repo";
import type { CreateTodoInput, TodoId, UpdateTodoInput } from "../schemas/todo";
import { TodoNotFound } from "../schemas/todo";

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class TodoService extends ServiceMap.Service<
  TodoService,
  {
    create(input: CreateTodoInput): Effect.Effect<any>;
    getById(id: TodoId): Effect.Effect<any, TodoNotFound>;
    list(opts?: {
      reviewId?: string;
      completed?: boolean;
      limit?: number;
      offset?: number;
    }): Effect.Effect<any>;
    update(
      id: TodoId,
      input: UpdateTodoInput
    ): Effect.Effect<any, TodoNotFound>;
    toggle(id: TodoId): Effect.Effect<any, TodoNotFound>;
    remove(id: TodoId): Effect.Effect<{ success: true }, TodoNotFound>;
    removeCompleted(): Effect.Effect<{ deleted: number }>;
    reorder(orderedIds: readonly string[]): Effect.Effect<{ updated: number }>;
    move(id: TodoId, position: number): Effect.Effect<any, TodoNotFound>;
    getStats(): Effect.Effect<{
      completed: number;
      pending: number;
      total: number;
    }>;
  }
>()("@ringi/TodoService") {
  static readonly Default: Layer.Layer<TodoService, never, TodoRepo> =
    Layer.effect(
      TodoService,
      Effect.gen(function* () {
        const repo = yield* TodoRepo;

        const create = (input: CreateTodoInput) => {
          const id = randomUUID() as TodoId;
          return repo.create({
            content: input.content,
            id,
            reviewId: input.reviewId ?? null,
          });
        };

        const getById = (id: TodoId) =>
          Effect.gen(function* () {
            const todo = yield* repo.findById(id);
            if (!todo) {
              return yield* new TodoNotFound({ id });
            }
            return todo;
          });

        const list = (
          opts: {
            reviewId?: string;
            completed?: boolean;
            limit?: number;
            offset?: number;
          } = {}
        ) =>
          Effect.gen(function* () {
            const result = yield* repo.findAll(opts);
            return {
              data: result.data,
              limit: opts.limit ?? null,
              offset: opts.offset ?? 0,
              total: result.total,
            };
          });

        const update = (id: TodoId, input: UpdateTodoInput) =>
          Effect.gen(function* () {
            const existing = yield* repo.findById(id);
            if (!existing) {
              return yield* new TodoNotFound({ id });
            }

            const updates: { content?: string; completed?: boolean } = {};
            if (input.content && Option.isSome(input.content)) {
              updates.content = input.content.value;
            }
            if (input.completed && Option.isSome(input.completed)) {
              updates.completed = input.completed.value;
            }

            const todo = yield* repo.update(id, updates);
            if (!todo) {
              return yield* new TodoNotFound({ id });
            }

            return todo;
          });

        const toggle = (id: TodoId) =>
          Effect.gen(function* () {
            const todo = yield* repo.toggle(id);
            if (!todo) {
              return yield* new TodoNotFound({ id });
            }
            return todo;
          });

        const remove = (id: TodoId) =>
          Effect.gen(function* () {
            const existing = yield* repo.findById(id);
            if (!existing) {
              return yield* new TodoNotFound({ id });
            }

            yield* repo.remove(id);
            return { success: true as const };
          });

        const removeCompleted = () =>
          Effect.gen(function* () {
            const deleted = yield* repo.removeCompleted();
            return { deleted };
          });

        const reorder = (orderedIds: readonly string[]) =>
          Effect.gen(function* () {
            const updated = yield* repo.reorder(orderedIds);
            return { updated };
          });

        const move = (id: TodoId, position: number) =>
          Effect.gen(function* () {
            const todo = yield* repo.move(id, position);
            if (!todo) {
              return yield* new TodoNotFound({ id });
            }
            return todo;
          });

        const getStats = () =>
          Effect.gen(function* () {
            const total = yield* repo.countAll();
            const completed = yield* repo.countCompleted();
            const pending = yield* repo.countPending();
            return { completed, pending, total };
          });

        return TodoService.of({
          create,
          getById,
          getStats,
          list,
          move,
          remove,
          removeCompleted,
          reorder,
          toggle,
          update,
        });
      })
    );
}
