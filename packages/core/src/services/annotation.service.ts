import { ServiceMap } from "effect";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { AnnotationRepo } from "../repos/annotation.repo";
import type {
  CreateAnnotationInput,
  ReviewAnnotation,
} from "../schemas/annotation";
import type { ReviewId } from "../schemas/review";

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AnnotationService extends ServiceMap.Service<
  AnnotationService,
  {
    add(
      reviewId: ReviewId,
      annotations: readonly CreateAnnotationInput[]
    ): Effect.Effect<readonly ReviewAnnotation[]>;
    removeById(id: string): Effect.Effect<boolean>;
    clearBySource(reviewId: ReviewId, source: string): Effect.Effect<number>;
    findByReview(
      reviewId: ReviewId
    ): Effect.Effect<readonly ReviewAnnotation[]>;
    findByFile(
      reviewId: ReviewId,
      filePath: string
    ): Effect.Effect<readonly ReviewAnnotation[]>;
    countByReview(reviewId: ReviewId): Effect.Effect<number>;
    stats(reviewId: ReviewId): Effect.Effect<{
      total: number;
      bySource: Record<string, number>;
    }>;
  }
>()("@ringi/AnnotationService") {
  static readonly Default: Layer.Layer<
    AnnotationService,
    never,
    AnnotationRepo
  > = Layer.effect(
    AnnotationService,
    Effect.gen(function* () {
      const repo = yield* AnnotationRepo;

      const add = (
        reviewId: ReviewId,
        annotations: readonly CreateAnnotationInput[]
      ) => repo.add(reviewId, annotations);

      const removeById = (id: string) => repo.removeById(id);

      const clearBySource = (reviewId: ReviewId, source: string) =>
        repo.clearBySource(reviewId, source);

      const findByReview = (reviewId: ReviewId) => repo.findByReview(reviewId);

      const findByFile = (reviewId: ReviewId, filePath: string) =>
        repo.findByFile(reviewId, filePath);

      const countByReview = (reviewId: ReviewId) =>
        repo.countByReview(reviewId);

      const stats = (reviewId: ReviewId) =>
        Effect.gen(function* () {
          const all = yield* repo.findByReview(reviewId);
          const bySource: Record<string, number> = {};
          for (const a of all) {
            bySource[a.source] = (bySource[a.source] ?? 0) + 1;
          }
          return { bySource, total: all.length };
        });

      return AnnotationService.of({
        add,
        clearBySource,
        countByReview,
        findByFile,
        findByReview,
        removeById,
        stats,
      });
    })
  );
}
