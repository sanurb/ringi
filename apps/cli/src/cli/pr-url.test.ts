import { looksLikePrUrl, parsePrUrl } from "@ringi/core/services/pr-url";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Helper: run an Effect synchronously for tests
// ---------------------------------------------------------------------------

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runSync(effect);

const runFail = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.runSync(effect.pipe(Effect.flip));

// ---------------------------------------------------------------------------
// looksLikePrUrl
// ---------------------------------------------------------------------------

describe("looksLikePrUrl", () => {
  it("matches standard GitHub PR URLs", () => {
    expect(looksLikePrUrl("https://github.com/owner/repo/pull/42")).toBe(true);
    expect(looksLikePrUrl("https://github.com/owner/repo/pull/42/files")).toBe(
      true
    );
    expect(
      looksLikePrUrl("https://github.com/owner/repo/pull/42/commits")
    ).toBe(true);
  });

  it("matches GHE URLs", () => {
    expect(looksLikePrUrl("https://ghe.corp.com/org/project/pull/123")).toBe(
      true
    );
    expect(looksLikePrUrl("http://ghe.internal/team/lib/pull/1")).toBe(true);
  });

  it("rejects non-PR URLs", () => {
    expect(looksLikePrUrl("https://github.com/owner/repo")).toBe(false);
    expect(looksLikePrUrl("https://github.com/owner/repo/issues/42")).toBe(
      false
    );
    expect(looksLikePrUrl("list")).toBe(false);
    expect(looksLikePrUrl("show")).toBe(false);
    expect(looksLikePrUrl("last")).toBe(false);
    expect(looksLikePrUrl("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parsePrUrl
// ---------------------------------------------------------------------------

describe("parsePrUrl", () => {
  it("parses a standard GitHub PR URL", () => {
    const result = run(
      parsePrUrl("https://github.com/octocat/hello-world/pull/42")
    );
    expect(result.host).toBe("github.com");
    expect(result.owner).toBe("octocat");
    expect(result.repo).toBe("hello-world");
    expect(result.prNumber).toBe(42);
    expect(result.nwoRef).toBe("octocat/hello-world");
    expect(result.url).toBe("https://github.com/octocat/hello-world/pull/42");
  });

  it("parses a GHE URL with custom host", () => {
    const result = run(
      parsePrUrl("https://ghe.corp.example.com/team/project/pull/7")
    );
    expect(result.host).toBe("ghe.corp.example.com");
    expect(result.owner).toBe("team");
    expect(result.repo).toBe("project");
    expect(result.prNumber).toBe(7);
  });

  it("strips trailing path segments (files, commits)", () => {
    const result = run(parsePrUrl("https://github.com/org/repo/pull/99/files"));
    expect(result.prNumber).toBe(99);
    expect(result.url).toBe("https://github.com/org/repo/pull/99");
  });

  it("supports http:// for GHE behind VPN", () => {
    const result = run(parsePrUrl("http://ghe.internal:8080/org/lib/pull/3"));
    expect(result.host).toBe("ghe.internal:8080");
    expect(result.prNumber).toBe(3);
  });

  it("fails on invalid URL", () => {
    const error = runFail(parsePrUrl("not-a-url"));
    expect(error._tag).toBe("InvalidPrUrl");
    expect(error.message).toContain("Not a valid URL");
  });

  it("fails on non-PR GitHub path", () => {
    const error = runFail(
      parsePrUrl("https://github.com/owner/repo/issues/42")
    );
    expect(error._tag).toBe("InvalidPrUrl");
    expect(error.message).toContain("/<owner>/<repo>/pull/<number>");
  });

  it("fails on PR number zero", () => {
    const error = runFail(parsePrUrl("https://github.com/owner/repo/pull/0"));
    expect(error._tag).toBe("InvalidPrUrl");
    expect(error.message).toContain("Invalid PR number");
  });

  it("fails on negative PR number", () => {
    const error = runFail(parsePrUrl("https://github.com/owner/repo/pull/-1"));
    expect(error._tag).toBe("InvalidPrUrl");
  });

  it("fails on non-numeric PR number", () => {
    const error = runFail(parsePrUrl("https://github.com/owner/repo/pull/abc"));
    expect(error._tag).toBe("InvalidPrUrl");
  });

  it("fails on unsupported protocol", () => {
    const error = runFail(parsePrUrl("ftp://github.com/owner/repo/pull/1"));
    expect(error._tag).toBe("InvalidPrUrl");
    expect(error.message).toContain("Unsupported protocol");
  });
});
