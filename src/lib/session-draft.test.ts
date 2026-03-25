import { describe, expect, it } from "vitest";

import { formatRelativeTime, isDraftRecoverable } from "./session-draft";
import type { SessionDraft } from "./session-draft";

describe("formatRelativeTime", () => {
  it("says 'just now' for recent timestamps", () => {
    expect(formatRelativeTime(Date.now() - 5000)).toBe("just now");
  });

  it("says 'less than a minute ago' for 30-59s", () => {
    expect(formatRelativeTime(Date.now() - 40_000)).toBe(
      "less than a minute ago"
    );
  });

  it("says '1 minute ago' for ~60s", () => {
    expect(formatRelativeTime(Date.now() - 65_000)).toBe("1 minute ago");
  });

  it("says 'N minutes ago' for 2-59 min", () => {
    expect(formatRelativeTime(Date.now() - 5 * 60_000)).toBe("5 minutes ago");
  });

  it("says '1 hour ago' for 60-119 min", () => {
    expect(formatRelativeTime(Date.now() - 70 * 60_000)).toBe("1 hour ago");
  });

  it("says 'N hours ago' for 2+ hours", () => {
    expect(formatRelativeTime(Date.now() - 3 * 60 * 60_000)).toBe(
      "3 hours ago"
    );
  });
});

describe("isDraftRecoverable", () => {
  const makeDraft = (overrides: Partial<SessionDraft> = {}): SessionDraft => ({
    savedAt: Date.now(),
    scope: "staged",
    selectedFile: null,
    viewedFiles: ["a.ts"],
    ...overrides,
  });

  it("returns true for valid draft matching current scope", () => {
    expect(isDraftRecoverable(makeDraft(), "staged")).toBe(true);
  });

  it("returns false for null", () => {
    expect(isDraftRecoverable(null, "staged")).toBe(false);
  });

  it("returns false for mismatched scope", () => {
    expect(isDraftRecoverable(makeDraft({ scope: "unstaged" }), "staged")).toBe(
      false
    );
  });

  it("returns false when no viewed files", () => {
    expect(isDraftRecoverable(makeDraft({ viewedFiles: [] }), "staged")).toBe(
      false
    );
  });
});
