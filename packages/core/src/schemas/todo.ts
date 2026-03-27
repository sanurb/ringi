import * as Schema from "effect/Schema";

import { ReviewId } from "./review";

export const TodoId = Schema.String.pipe(Schema.brand("TodoId"));
export type TodoId = typeof TodoId.Type;

export const Todo = Schema.Struct({
  completed: Schema.Boolean,
  content: Schema.String,
  createdAt: Schema.String,
  id: TodoId,
  position: Schema.Number,
  reviewId: Schema.NullOr(ReviewId),
  updatedAt: Schema.String,
});
export type Todo = typeof Todo.Type;

export const CreateTodoInput = Schema.Struct({
  content: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  reviewId: Schema.NullOr(ReviewId).pipe(
    Schema.optionalKey,
    Schema.withDecodingDefaultKey(() => null)
  ),
});
export type CreateTodoInput = typeof CreateTodoInput.Type;

export const UpdateTodoInput = Schema.Struct({
  completed: Schema.OptionFromNullOr(Schema.Boolean).pipe(Schema.optionalKey),
  content: Schema.OptionFromNullOr(
    Schema.String.pipe(Schema.check(Schema.isMinLength(1)))
  ).pipe(Schema.optionalKey),
});
export type UpdateTodoInput = typeof UpdateTodoInput.Type;

export class TodoNotFound extends Schema.TaggedErrorClass<TodoNotFound>()(
  "TodoNotFound",
  { id: TodoId }
) {}
