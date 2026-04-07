import { ServiceMap } from "effect";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { CoverageRepo } from "../repos/coverage.repo";
import { ReviewFileRepo } from "../repos/review-file.repo";
import { ReviewHunkRepo } from "../repos/review-hunk.repo";
import { mergeRanges } from "../schemas/coverage";
import type { CoverageSummary } from "../schemas/coverage";
import type { ReviewId } from "../schemas/review";

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CoverageService extends ServiceMap.Service<
  CoverageService,
  {
    markHunkReviewed(
      reviewId: ReviewId,
      hunkStableId: string
    ): Effect.Effect<void>;
    markRangeReviewed(
      reviewId: ReviewId,
      hunkStableId: string,
      startLine: number,
      endLine: number
    ): Effect.Effect<void>;
    unmark(reviewId: ReviewId, hunkStableId: string): Effect.Effect<void>;
    getSummary(reviewId: ReviewId): Effect.Effect<CoverageSummary>;
  }
>()("@ringi/CoverageService") {
  static readonly Default: Layer.Layer<
    CoverageService,
    never,
    CoverageRepo | ReviewHunkRepo | ReviewFileRepo
  > = Layer.effect(
    CoverageService,
    Effect.gen(function* () {
      const coverageRepo = yield* CoverageRepo;
      const hunkRepo = yield* ReviewHunkRepo;
      const fileRepo = yield* ReviewFileRepo;

      const markHunkReviewed = (
        reviewId: ReviewId,
        hunkStableId: string
      ): Effect.Effect<void> =>
        coverageRepo.markRange(reviewId, hunkStableId, null, null);

      const markRangeReviewed = (
        reviewId: ReviewId,
        hunkStableId: string,
        startLine: number,
        endLine: number
      ): Effect.Effect<void> =>
        coverageRepo.markRange(reviewId, hunkStableId, startLine, endLine);

      const unmark = (
        reviewId: ReviewId,
        hunkStableId: string
      ): Effect.Effect<void> => coverageRepo.unmark(reviewId, hunkStableId);

      const getSummary = (reviewId: ReviewId): Effect.Effect<CoverageSummary> =>
        Effect.gen(function* () {
          // Get total hunk count from review_hunks via review_files
          const fileRows = yield* fileRepo.findByReview(reviewId);
          let totalHunks = 0;
          const allHunkStableIds = new Set<string>();

          for (const file of fileRows) {
            const hunks = yield* hunkRepo.findByReviewFile(file.id);
            totalHunks += hunks.length;
            for (const h of hunks) {
              allHunkStableIds.add(h.stableId);
            }
          }

          // Get coverage entries
          const coverageRows = yield* coverageRepo.findByReview(reviewId);

          // Group coverage entries by hunk
          const coverageByHunk = new Map<
            string,
            {
              hasFullCoverage: boolean;
              ranges: { start: number; end: number }[];
            }
          >();

          for (const row of coverageRows) {
            let entry = coverageByHunk.get(row.hunk_stable_id);
            if (!entry) {
              entry = { hasFullCoverage: false, ranges: [] };
              coverageByHunk.set(row.hunk_stable_id, entry);
            }
            if (row.start_line === null || row.end_line === null) {
              entry.hasFullCoverage = true;
            } else {
              entry.ranges.push({ end: row.end_line, start: row.start_line });
            }
          }

          let reviewedHunks = 0;
          let partialHunks = 0;

          for (const [, entry] of coverageByHunk) {
            if (entry.hasFullCoverage) {
              reviewedHunks++;
            } else if (entry.ranges.length > 0) {
              // Has partial coverage (line ranges but not full hunk)
              const merged = mergeRanges(entry.ranges);
              if (merged.length > 0) {
                partialHunks++;
              }
            }
          }

          const unreviewedHunks = totalHunks - reviewedHunks - partialHunks;

          return {
            partialHunks,
            reviewedHunks,
            totalHunks,
            unreviewedHunks,
          };
        });

      return CoverageService.of({
        getSummary,
        markHunkReviewed,
        markRangeReviewed,
        unmark,
      });
    })
  );
}
