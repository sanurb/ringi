import * as HttpApiBuilder from "@effect/platform/HttpApiBuilder";
import * as Effect from "effect/Effect";

import { DomainApi } from "@/api/domain-api";

import { TodoService } from "../services/todo.service";

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
          return yield* svc.getById(_.path.id);
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
          return yield* svc.update(_.path.id, _.payload);
        })
      )
      .handle("toggle", (_) =>
        Effect.gen(function* TodosApiLive() {
          const svc = yield* TodoService;
          return yield* svc.toggle(_.path.id);
        })
      )
      .handle("remove", (_) =>
        Effect.gen(function* TodosApiLive() {
          const svc = yield* TodoService;
          return yield* svc.remove(_.path.id);
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
          return yield* svc.move(_.path.id, _.payload.position);
        })
      )
      .handle("stats", (_) =>
        Effect.gen(function* TodosApiLive() {
          const svc = yield* TodoService;
          return yield* svc.getStats;
        })
      )
);
