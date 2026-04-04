import { DomainApi } from "@ringi/core/api/domain-api";
import * as Effect from "effect/Effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

export const HealthApiLive = HttpApiBuilder.group(
  DomainApi,
  "health",
  (handlers) =>
    handlers.handle("check", () => Effect.succeed({ ok: true as const }))
);
