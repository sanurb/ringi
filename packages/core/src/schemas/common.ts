import * as Schema from "effect/Schema";

export const HealthResponse = Schema.Struct({
  authRequired: Schema.Boolean,
  status: Schema.Literal("ok"),
});
export type HealthResponse = typeof HealthResponse.Type;

export const SuccessResponse = Schema.Struct({
  success: Schema.Literal(true),
});
export type SuccessResponse = typeof SuccessResponse.Type;

export const PaginatedParams = Schema.Struct({
  page: Schema.optionalWith(Schema.NumberFromString, { default: () => 1 }),
  pageSize: Schema.optionalWith(Schema.NumberFromString, { default: () => 20 }),
});
export type PaginatedParams = typeof PaginatedParams.Type;
