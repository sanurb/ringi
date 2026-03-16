import * as Rpc from "@effect/rpc/Rpc";
import * as RpcGroup from "@effect/rpc/RpcGroup";
import * as Schema from "effect/Schema";
import {
  CreateTodoInput,
  Todo,
  TodoId,
  TodoNotFound,
  UpdateTodoInput,
} from "./todo-schema";

export class TodosRpc extends RpcGroup.make(
  Rpc.make("list", {
    success: Schema.Array(Todo),
  }),

  Rpc.make("getById", {
    success: Todo,
    error: TodoNotFound,
    payload: { id: TodoId },
  }),

  Rpc.make("create", {
    success: Todo,
    payload: { input: CreateTodoInput },
  }),

  Rpc.make("update", {
    success: Todo,
    error: TodoNotFound,
    payload: { id: TodoId, input: UpdateTodoInput },
  }),

  Rpc.make("remove", {
    success: Schema.Void,
    error: TodoNotFound,
    payload: { id: TodoId },
  }),
).prefix("todos_") {}

export class DomainRpc extends RpcGroup.make().merge(TodosRpc) {}
