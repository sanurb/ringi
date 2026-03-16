import { DomainApi } from "@/api/domain-api";
import * as HttpApiBuilder from "@effect/platform/HttpApiBuilder";
import * as Layer from "effect/Layer";
import * as Effect from "effect/Effect";
import { TodosService } from "./todos-service";

export const TodosApiLive = HttpApiBuilder.group(
  DomainApi,
  "todos",
  (handlers) =>
    handlers
      .handle("list", () =>
        Effect.gen(function* () {
          const todos = yield* TodosService;
          return yield* todos.list;
        }),
      )
      .handle("getById", ({ path }) =>
        Effect.gen(function* () {
          const todos = yield* TodosService;
          return yield* todos.getById(path.id);
        }),
      )
      .handle("create", ({ payload }) =>
        Effect.gen(function* () {
          const todos = yield* TodosService;
          return yield* todos.create(payload);
        }),
      )
      .handle("update", ({ path, payload }) =>
        Effect.gen(function* () {
          const todos = yield* TodosService;
          return yield* todos.update(path.id, payload);
        }),
      )
      .handle("remove", ({ path }) =>
        Effect.gen(function* () {
          const todos = yield* TodosService;
          return yield* todos.remove(path.id);
        }),
      ),
).pipe(Layer.provide(TodosService.Default));
