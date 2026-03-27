import type * as Effect from "effect/Effect";
import * as ManagedRuntime from "effect/ManagedRuntime";

import { ApiClient } from "@/api/api-client";

const runtime = ManagedRuntime.make(ApiClient.Default);

// Expose a typed wrapper that accepts effects requiring ApiClient
export const clientRuntime = {
  ...runtime,
  // Widen the R to accept effects that TypeScript infers as `unknown`
  // due to `any`-typed service shapes. At runtime the managed runtime
  // provides the correct environment.
  runFork: runtime.runFork as <A, E>(
    self: Effect.Effect<A, E, any>,
    options?: Effect.RunOptions
  ) => any,
  runPromise: runtime.runPromise as <A, E>(
    effect: Effect.Effect<A, E, any>,
    options?: Effect.RunOptions
  ) => Promise<A>,
};
