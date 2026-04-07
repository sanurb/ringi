import * as Schema from "effect/Schema";

import { ReviewId } from "./review";

// ---------------------------------------------------------------------------
// Coverage Entry — a single reviewed range within a hunk
// ---------------------------------------------------------------------------

export const CoverageEntry = Schema.Struct({
  createdAt: Schema.String,
  endLine: Schema.NullOr(Schema.Number), // null = full hunk coverage
  hunkStableId: Schema.String,
  id: Schema.String,
  reviewId: ReviewId,
  startLine: Schema.NullOr(Schema.Number), // null = full hunk coverage
});
export type CoverageEntry = typeof CoverageEntry.Type;

// ---------------------------------------------------------------------------
// Coverage Summary — aggregate per review
// ---------------------------------------------------------------------------

export const CoverageSummary = Schema.Struct({
  partialHunks: Schema.Number,
  reviewedHunks: Schema.Number,
  totalHunks: Schema.Number,
  unreviewedHunks: Schema.Number,
});
export type CoverageSummary = typeof CoverageSummary.Type;

// ---------------------------------------------------------------------------
// Range merging — pure function
// ---------------------------------------------------------------------------

export interface LineRange {
  readonly start: number;
  readonly end: number;
}

/**
 * Merge overlapping or adjacent line ranges into minimal non-overlapping set.
 *
 * Rules:
 *   [0,5] + [3,8]  → [0,8]   (overlapping)
 *   [0,5] + [6,10] → [0,10]  (adjacent — gap of 1 merges)
 *   [0,5] + [7,10] → [0,5], [7,10]  (gap)
 */
export const mergeRanges = (
  ranges: readonly LineRange[]
): readonly LineRange[] => {
  if (ranges.length <= 1) return ranges;

  const sorted = [...ranges].toSorted((a, b) => a.start - b.start);
  const merged: LineRange[] = [sorted[0]!];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!;
    const last = merged[merged.length - 1]!;

    // Adjacent means gap of exactly 1 (consecutive lines)
    if (current.start <= last.end + 1) {
      merged[merged.length - 1] = {
        end: Math.max(last.end, current.end),
        start: last.start,
      };
    } else {
      merged.push(current);
    }
  }

  return merged;
};
