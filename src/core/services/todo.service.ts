import { randomUUID } from "node:crypto";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type {
  CreateTodoInput,
  TodoId,
  UpdateTodoInput,
} from "@/api/schemas/todo";
import { TodoNotFound } from "@/api/schemas/todo";
import { TodoRepo } from "@/core/repos/todo.repo";

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class TodoService extends Effect.Service<TodoService>()(
  "@ringi/TodoService",
  {
    dependencies: [TodoRepo.Default],
    effect: Effect.sync(() => {
      // -----------------------------------------------------------------------
      // create
      // -----------------------------------------------------------------------
      const create = (input: CreateTodoInput) =>
        Effect.gen(function* create() {
          const repo = yield* TodoRepo;
          const id = randomUUID() as TodoId;
          return yield* repo.create({
            content: input.content,
            id,
            reviewId: input.reviewId,
          });
        });

      // -----------------------------------------------------------------------
      // getById
      // -----------------------------------------------------------------------
      const getById = (id: TodoId) =>
        Effect.gen(function* getById() {
          const repo = yield* TodoRepo;
          const todo = yield* repo.findById(id);
          if (!todo) {
            return yield* new TodoNotFound({ id });
          }
          return todo;
        });

      // -----------------------------------------------------------------------
      // list
      // -----------------------------------------------------------------------
      const list = (
        opts: {
          reviewId?: string;
          completed?: boolean;
          limit?: number;
          offset?: number;
        } = {}
      ) =>
        Effect.gen(function* list() {
          const repo = yield* TodoRepo;
          const result = yield* repo.findAll(opts);
          return {
            data: result.data,
            limit: opts.limit ?? null,
            offset: opts.offset ?? 0,
            total: result.total,
          };
        });

      // -----------------------------------------------------------------------
      // update
      // -----------------------------------------------------------------------
      const update = (id: TodoId, input: UpdateTodoInput) =>
        Effect.gen(function* update() {
          const repo = yield* TodoRepo;

          const existing = yield* repo.findById(id);
          if (!existing) {
            return yield* new TodoNotFound({ id });
          }

          const updates: { content?: string; completed?: boolean } = {};
          if (Option.isSome(input.content)) {
            updates.content = input.content.value;
          }
          if (Option.isSome(input.completed)) {
            updates.completed = input.completed.value;
          }

          const todo = yield* repo.update(id, updates);
          if (!todo) {
            return yield* new TodoNotFound({ id });
          }

          return todo;
        });

      // -----------------------------------------------------------------------
      // toggle
      // -----------------------------------------------------------------------
      const toggle = (id: TodoId) =>
        Effect.gen(function* toggle() {
          const repo = yield* TodoRepo;
          const todo = yield* repo.toggle(id);
          if (!todo) {
            return yield* new TodoNotFound({ id });
          }
          return todo;
        });

      // -----------------------------------------------------------------------
      // remove
      // -----------------------------------------------------------------------
      const remove = (id: TodoId) =>
        Effect.gen(function* remove() {
          const repo = yield* TodoRepo;

          const existing = yield* repo.findById(id);
          if (!existing) {
            return yield* new TodoNotFound({ id });
          }

          yield* repo.remove(id);
          return { success: true as const };
        });

      // -----------------------------------------------------------------------
      // removeCompleted
      // -----------------------------------------------------------------------
      const removeCompleted = () =>
        Effect.gen(function* removeCompleted() {
          const repo = yield* TodoRepo;
          const deleted = yield* repo.removeCompleted();
          return { deleted };
        });

      // -----------------------------------------------------------------------
      // reorder
      // -----------------------------------------------------------------------
      const reorder = (orderedIds: readonly string[]) =>
        Effect.gen(function* reorder() {
          const repo = yield* TodoRepo;
          const updated = yield* repo.reorder(orderedIds);
          return { updated };
        });

      // -----------------------------------------------------------------------
      // move
      // -----------------------------------------------------------------------
      const move = (id: TodoId, position: number) =>
        Effect.gen(function* move() {
          const repo = yield* TodoRepo;
          const todo = yield* repo.move(id, position);
          if (!todo) {
            return yield* new TodoNotFound({ id });
          }
          return todo;
        });

      // -----------------------------------------------------------------------
      // getStats
      // -----------------------------------------------------------------------
      const getStats = Effect.gen(function* getStats() {
        const repo = yield* TodoRepo;
        const total = yield* repo.countAll();
        const completed = yield* repo.countCompleted();
        const pending = yield* repo.countPending();
        return { completed, pending, total };
      });

      // -----------------------------------------------------------------------
      // Public interface
      // -----------------------------------------------------------------------
      return {
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
      } as const;
    }),
  }
) {}
