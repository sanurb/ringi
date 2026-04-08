import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import {
  decodeCreateTodoInput,
  decodeReviewCreateInput,
  ReviewContextInput,
  ReviewDiffQuery,
  ReviewExportInput,
  ReviewListFilters,
  TodoListFilter,
  TodoMoveInput,
} from "@/mcp/schemas";

// ---------------------------------------------------------------------------
// decodeReviewCreateInput
// ---------------------------------------------------------------------------

describe("decodeReviewCreateInput", () => {
  it("decodes spec shape { source: { type, baseRef } }", () => {
    const result = decodeReviewCreateInput({
      source: { baseRef: "main", type: "branch" },
    });
    expect(result).toEqual({ sourceRef: "main", sourceType: "branch" });
  });

  it("decodes legacy shape { sourceType, sourceRef }", () => {
    const result = decodeReviewCreateInput({
      sourceRef: "abc123",
      sourceType: "commits",
    });
    expect(result).toEqual({ sourceRef: "abc123", sourceType: "commits" });
  });

  it("defaults to staged when no type specified (spec)", () => {
    const result = decodeReviewCreateInput({ source: {} });
    expect(result).toEqual({ sourceRef: null, sourceType: "staged" });
  });

  it("defaults to staged when no type specified (legacy)", () => {
    const result = decodeReviewCreateInput({});
    expect(result).toEqual({ sourceRef: null, sourceType: "staged" });
  });

  it("rejects invalid sourceType", () => {
    expect(() => decodeReviewCreateInput({ sourceType: "invalid" })).toThrow();
  });

  it("rejects non-object input", () => {
    expect(() => decodeReviewCreateInput("not-an-object")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// decodeCreateTodoInput
// ---------------------------------------------------------------------------

describe("decodeCreateTodoInput", () => {
  it("decodes spec shape { text } ", () => {
    const result = decodeCreateTodoInput({ text: "Fix the bug" });
    expect(result).toEqual({ content: "Fix the bug", reviewId: null });
  });

  it("decodes legacy shape { content }", () => {
    const result = decodeCreateTodoInput({ content: "Fix the bug" });
    expect(result).toEqual({ content: "Fix the bug", reviewId: null });
  });

  it("includes reviewId when provided", () => {
    const result = decodeCreateTodoInput({
      reviewId: "abc-123",
      text: "Fix the bug",
    });
    expect(result.content).toBe("Fix the bug");
    expect(result.reviewId).toBe("abc-123");
  });

  it("rejects empty text", () => {
    expect(() => decodeCreateTodoInput({ text: "" })).toThrow();
  });

  it("rejects missing content", () => {
    expect(() => decodeCreateTodoInput({})).toThrow();
  });

  it("rejects non-object input", () => {
    expect(() => decodeCreateTodoInput(42)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// ReviewExportInput
// ---------------------------------------------------------------------------

describe("ReviewExportInput", () => {
  const decode = Schema.decodeUnknownSync(ReviewExportInput);

  it("decodes valid reviewId", () => {
    const result = decode({ reviewId: "review-1" });
    expect(result.reviewId).toBe("review-1");
  });

  it("rejects missing reviewId", () => {
    expect(() => decode({})).toThrow();
  });
});

// ---------------------------------------------------------------------------
// ReviewDiffQuery
// ---------------------------------------------------------------------------

describe("ReviewDiffQuery", () => {
  const decode = Schema.decodeUnknownSync(ReviewDiffQuery);

  it("decodes valid query", () => {
    const result = decode({ filePath: "src/main.ts", reviewId: "r1" });
    expect(result.reviewId).toBe("r1");
    expect(result.filePath).toBe("src/main.ts");
  });

  it("rejects empty filePath", () => {
    expect(() => decode({ filePath: "", reviewId: "r1" })).toThrow();
  });

  it("rejects missing reviewId", () => {
    expect(() => decode({ filePath: "src/main.ts" })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// ReviewListFilters
// ---------------------------------------------------------------------------

describe("ReviewListFilters", () => {
  const decode = Schema.decodeUnknownSync(ReviewListFilters);

  it("applies defaults for empty object", () => {
    const result = decode({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.pageSize).toBe(20);
  });

  it("accepts explicit values", () => {
    const result = decode({ limit: 10, page: 3 });
    expect(result.page).toBe(3);
    expect(result.limit).toBe(10);
  });

  it("passes through status and sourceType", () => {
    const result = decode({ sourceType: "branch", status: "approved" });
    expect(result.status).toBe("approved");
    expect(result.sourceType).toBe("branch");
  });
});

// ---------------------------------------------------------------------------
// ReviewContextInput
// ---------------------------------------------------------------------------

describe("ReviewContextInput", () => {
  const decode = Schema.decodeUnknownSync(ReviewContextInput);

  it("applies defaults when mode and filePath are omitted", () => {
    const result = decode({ reviewId: "review-1" });
    expect(result).toEqual({
      reviewId: "review-1",
      mode: "review-summary",
      filePath: null,
    });
  });

  it("accepts explicit mode and filePath", () => {
    const result = decode({
      reviewId: "review-1",
      mode: "file-focus",
      filePath: "src/main.ts",
    });
    expect(result).toEqual({
      reviewId: "review-1",
      mode: "file-focus",
      filePath: "src/main.ts",
    });
  });
});

// ---------------------------------------------------------------------------
// TodoListFilter
// ---------------------------------------------------------------------------

describe("TodoListFilter", () => {
  const decode = Schema.decodeUnknownSync(TodoListFilter);

  it("decodes empty filter", () => {
    const result = decode({});
    expect(result.reviewId).toBeUndefined();
  });

  it("decodes filter with reviewId", () => {
    const result = decode({ reviewId: "r1" });
    expect(result.reviewId).toBe("r1");
  });
});

// ---------------------------------------------------------------------------
// TodoMoveInput
// ---------------------------------------------------------------------------

describe("TodoMoveInput", () => {
  const decode = Schema.decodeUnknownSync(TodoMoveInput);

  it("decodes valid input", () => {
    const result = decode({ position: 3, todoId: "t1" });
    expect(result.todoId).toBe("t1");
    expect(result.position).toBe(3);
  });

  it("rejects non-number position", () => {
    expect(() => decode({ position: "three", todoId: "t1" })).toThrow();
  });

  it("rejects missing todoId", () => {
    expect(() => decode({ position: 1 })).toThrow();
  });
});
