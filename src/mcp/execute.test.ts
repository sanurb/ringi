import { describe, expect, it } from "vitest";

import { clampTimeout, ensureCode, finalizeOutput } from "@/mcp/execute";
import type { ExecuteOutput } from "@/mcp/execute";

// ---------------------------------------------------------------------------
// ensureCode
// ---------------------------------------------------------------------------

describe("ensureCode", () => {
  it("rejects non-string input", () => {
    expect(() => ensureCode(42)).toThrow("expected a string");
  });

  it("rejects empty string", () => {
    expect(() => ensureCode("   ")).toThrow("non-empty");
  });

  it("rejects code exceeding max length", () => {
    const longCode = "a".repeat(50_001);
    expect(() => ensureCode(longCode)).toThrow("maximum length");
  });

  it("accepts valid code and trims whitespace", () => {
    expect(ensureCode("  return 1  ")).toBe("return 1");
  });

  it("accepts code at exactly max length", () => {
    const code = "a".repeat(50_000);
    expect(ensureCode(code)).toBe(code);
  });
});

// ---------------------------------------------------------------------------
// clampTimeout
// ---------------------------------------------------------------------------

describe("clampTimeout", () => {
  const config = {
    defaultTimeoutMs: 30_000,
    maxTimeoutMs: 120_000,
  };

  it("returns default when timeout is undefined", () => {
    expect(clampTimeout(undefined, config)).toBe(30_000);
  });

  it("clamps values above max", () => {
    expect(clampTimeout(200_000, config)).toBe(120_000);
  });

  it("passes through valid values", () => {
    expect(clampTimeout(5000, config)).toBe(5000);
  });

  it("rejects non-finite values", () => {
    expect(() => clampTimeout(Number.NaN, config)).toThrow("Invalid timeout");
  });

  it("rejects zero", () => {
    expect(() => clampTimeout(0, config)).toThrow("Invalid timeout");
  });

  it("rejects negative values", () => {
    expect(() => clampTimeout(-1, config)).toThrow("Invalid timeout");
  });
});

// ---------------------------------------------------------------------------
// finalizeOutput — truncation
// ---------------------------------------------------------------------------

describe("finalizeOutput", () => {
  it("returns output unchanged when under budget", () => {
    const output: ExecuteOutput = { ok: true, result: { data: "small" } };
    const result = finalizeOutput(output, 100_000);
    expect(result.truncated).toBeUndefined();
    expect(result.result).toEqual({ data: "small" });
  });

  it("truncates and sets flag when over budget", () => {
    const largeResult = "x".repeat(200_000);
    const output: ExecuteOutput = { ok: true, result: largeResult };
    const result = finalizeOutput(output, 1000);
    expect(result.truncated).toBe(true);
    expect((result.result as { note: string }).note).toContain("truncated");
  });

  it("preserves ok status on truncation", () => {
    const largeResult = "x".repeat(200_000);
    const output: ExecuteOutput = { ok: true, result: largeResult };
    const result = finalizeOutput(output, 1000);
    expect(result.ok).toBe(true);
  });
});
