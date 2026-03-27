import { DomainApi } from "@ringi/core/api/domain-api";
import { TodoService } from "@ringi/core/services/todo.service";
import * as Effect from "effect/Effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

export const TodosApiLive = HttpApiBuilder.group(
  DomainApi,
  "todos",
  (handlers) =>
    handlers
      .handle("list", (_) =>
        Effect.gen(function* TodosApiLive() {
          const svc = yield* TodoService;
          return yield* svc.list({});
        })
      )
      .handle("getById", (_) =>
        Effect.gen(function* TodosApiLive() {
          const svc = yield* TodoService;
          return yield* svc.getById(_.params.id);
        })
      )
      .handle("create", (_) =>
        Effect.gen(function* TodosApiLive() {
          const svc = yield* TodoService;
          return yield* svc.create(_.payload);
        })
      )
      .handle("update", (_) =>
        Effect.gen(function* TodosApiLive() {
          const svc = yield* TodoService;
          return yield* svc.update(_.params.id, _.payload);
        })
      )
      .handle("toggle", (_) =>
        Effect.gen(function* TodosApiLive() {
          const svc = yield* TodoService;
          return yield* svc.toggle(_.params.id);
        })
      )
      .handle("remove", (_) =>
        Effect.gen(function* TodosApiLive() {
          const svc = yield* TodoService;
          return yield* svc.remove(_.params.id);
        })
      )
      .handle("removeCompleted", (_) =>
        Effect.gen(function* TodosApiLive() {
          const svc = yield* TodoService;
          return yield* svc.removeCompleted();
        })
      )
      .handle("reorder", (_) =>
        Effect.gen(function* TodosApiLive() {
          const svc = yield* TodoService;
          return yield* svc.reorder(_.payload.orderedIds);
        })
      )
      .handle("move", (_) =>
        Effect.gen(function* TodosApiLive() {
          const svc = yield* TodoService;
          return yield* svc.move(_.params.id, _.payload.position);
        })
      )
      .handle("stats", (_) =>
        Effect.gen(function* TodosApiLive() {
          const svc = yield* TodoService;
          return yield* svc.getStats();
        })
      )
);
