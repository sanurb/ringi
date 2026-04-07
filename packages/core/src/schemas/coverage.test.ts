import { mergeRanges } from "@ringi/core/schemas/coverage";
import { describe, expect, it } from "vitest";

describe("mergeRanges", () => {
  it("returns empty for empty input", () => {
    expect(mergeRanges([])).toEqual([]);
  });

  it("returns single range unchanged", () => {
    expect(mergeRanges([{ end: 5, start: 0 }])).toEqual([{ end: 5, start: 0 }]);
  });

  it("merges overlapping ranges", () => {
    const result = mergeRanges([
      { end: 5, start: 0 },
      { end: 8, start: 3 },
    ]);
    expect(result).toEqual([{ end: 8, start: 0 }]);
  });

  it("merges adjacent ranges (gap of 1)", () => {
    const result = mergeRanges([
      { end: 5, start: 0 },
      { end: 10, start: 6 },
    ]);
    expect(result).toEqual([{ end: 10, start: 0 }]);
  });

  it("keeps non-adjacent ranges separate", () => {
    const result = mergeRanges([
      { end: 5, start: 0 },
      { end: 10, start: 7 },
    ]);
    expect(result).toEqual([
      { end: 5, start: 0 },
      { end: 10, start: 7 },
    ]);
  });

  it("handles unsorted input", () => {
    const result = mergeRanges([
      { end: 10, start: 7 },
      { end: 5, start: 0 },
      { end: 8, start: 3 },
    ]);
    expect(result).toEqual([{ end: 10, start: 0 }]);
  });

  it("merges fully contained ranges", () => {
    const result = mergeRanges([
      { end: 20, start: 0 },
      { end: 10, start: 5 },
    ]);
    expect(result).toEqual([{ end: 20, start: 0 }]);
  });

  it("merges identical ranges", () => {
    const result = mergeRanges([
      { end: 5, start: 0 },
      { end: 5, start: 0 },
    ]);
    expect(result).toEqual([{ end: 5, start: 0 }]);
  });

  it("handles many non-overlapping ranges", () => {
    const result = mergeRanges([
      { end: 5, start: 0 },
      { end: 15, start: 10 },
      { end: 25, start: 20 },
    ]);
    expect(result).toEqual([
      { end: 5, start: 0 },
      { end: 15, start: 10 },
      { end: 25, start: 20 },
    ]);
  });

  it("merges chain of adjacent ranges", () => {
    const result = mergeRanges([
      { end: 5, start: 0 },
      { end: 10, start: 6 },
      { end: 15, start: 11 },
    ]);
    expect(result).toEqual([{ end: 15, start: 0 }]);
  });
});
