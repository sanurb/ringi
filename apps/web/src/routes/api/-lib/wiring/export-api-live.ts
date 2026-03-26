import * as HttpApiBuilder from "@effect/platform/HttpApiBuilder";
import { DomainApi } from "@ringi/core/api/domain-api";
import { ExportService } from "@ringi/core/services/export.service";
import * as Effect from "effect/Effect";

export const ExportApiLive = HttpApiBuilder.group(
  DomainApi,
  "export",
  (handlers) =>
    handlers.handle("markdown", (_) =>
      Effect.gen(function* ExportApiLive() {
        const svc = yield* ExportService;
        return yield* svc.exportReview(_.path.id);
      })
    )
);
