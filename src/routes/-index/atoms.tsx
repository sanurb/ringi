import { ApiClient } from "@/api/api-client";
import {
  CreateTodoInput,
  Todo,
  TodoId,
  UpdateTodoInput,
} from "@/api/todo-schema";
import { serializable } from "@/lib/atom-utils";
import { Atom, Result } from "@effect-atom/atom-react";
import * as RpcClientError from "@effect/rpc/RpcClientError";
import * as Arr from "effect/Array";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const TodosSchema = Schema.Array(Todo);

class Api extends Effect.Service<Api>()("@app/index/Api", {
  dependencies: [ApiClient.Default],
  effect: Effect.gen(function* () {
    const { rpc } = yield* ApiClient;

    return {
      list: () => rpc.todos_list(),
      create: (input: CreateTodoInput) => rpc.todos_create({ input }),
      update: (id: TodoId, input: UpdateTodoInput) =>
        rpc.todos_update({ id, input }),
      remove: (id: TodoId) => rpc.todos_remove({ id }),
    } as const;
  }),
}) {}

export const runtime = Atom.runtime(Api.Default);

type TodosCacheUpdate = Data.TaggedEnum<{
  Upsert: { readonly todo: Todo };
  Delete: { readonly id: TodoId };
}>;

export const todosAtom = (() => {
  const remoteAtom = runtime
    .atom(
      Effect.gen(function* () {
        const api = yield* Api;
        return yield* api.list();
      }),
    )
    .pipe(
      serializable({
        key: "@app/index/todos",
        schema: Result.Schema({
          success: TodosSchema,
          error: RpcClientError.RpcClientError,
        }),
      }),
    );

  return Object.assign(
    Atom.writable(
      (get) => get(remoteAtom),
      (ctx, update: TodosCacheUpdate) => {
        const current = ctx.get(todosAtom);
        if (!Result.isSuccess(current)) return;

        const nextValue = (() => {
          switch (update._tag) {
            case "Upsert": {
              const existingIndex = Arr.findFirstIndex(
                current.value,
                (t) => t.id === update.todo.id,
              );
              return Option.match(existingIndex, {
                onNone: () => Arr.prepend(current.value, update.todo),
                onSome: (index) =>
                  Arr.replace(current.value, index, update.todo),
              });
            }
            case "Delete": {
              return Arr.filter(current.value, (t) => t.id !== update.id);
            }
          }
        })();

        ctx.setSelf(Result.success(nextValue));
      },
      (refresh) => {
        refresh(remoteAtom);
      },
    ),
    { remote: remoteAtom },
  );
})();

export const createTodoAtom = runtime.fn<CreateTodoInput>()(
  Effect.fnUntraced(function* (input, get) {
    const api = yield* Api;
    const result = yield* api.create(input);
    get.set(todosAtom, { _tag: "Upsert", todo: result });
    return result;
  }),
);

export const updateTodoAtom = runtime.fn<{
  readonly id: TodoId;
  readonly input: UpdateTodoInput;
}>()(
  Effect.fnUntraced(function* ({ id, input }, get) {
    const api = yield* Api;
    const result = yield* api.update(id, input);
    get.set(todosAtom, { _tag: "Upsert", todo: result });
    return result;
  }),
);

export const deleteTodoAtom = runtime.fn<TodoId>()(
  Effect.fnUntraced(function* (id, get) {
    const api = yield* Api;
    yield* api.remove(id);
    get.set(todosAtom, { _tag: "Delete", id });
  }),
);
