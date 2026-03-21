import * as HttpApiSchema from "@effect/platform/HttpApiSchema";
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
  content: Schema.String.pipe(Schema.minLength(1)),
  reviewId: Schema.optionalWith(Schema.NullOr(ReviewId), {
    default: () => null,
  }),
});
export type CreateTodoInput = typeof CreateTodoInput.Type;

export const UpdateTodoInput = Schema.Struct({
  completed: Schema.optionalWith(Schema.Boolean, { as: "Option" }),
  content: Schema.optionalWith(Schema.String.pipe(Schema.minLength(1)), {
    as: "Option",
  }),
});
export type UpdateTodoInput = typeof UpdateTodoInput.Type;

export class TodoNotFound extends Schema.TaggedError<TodoNotFound>()(
  "TodoNotFound",
  { id: TodoId },
  HttpApiSchema.annotations({ status: 404 })
) {}
