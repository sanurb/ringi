import * as HttpApiBuilder from "@effect/platform/HttpApiBuilder";
import * as Effect from "effect/Effect";

import { DomainApi } from "@/api/domain-api";

import { ExportService } from "../services/export.service";

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
