import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type { PrTarget } from "../schemas/pr";

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class InvalidPrUrl extends Schema.TaggedErrorClass<InvalidPrUrl>()(
  "InvalidPrUrl",
  {
    message: Schema.String,
    url: Schema.String,
  }
) {}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Quick heuristic: does this string look like a PR URL?
 *
 * Used by the CLI parser to distinguish `review <url>` from `review <verb>`.
 * No ambiguity: no review verb starts with `http`.
 */
export const looksLikePrUrl = (s: string): boolean =>
  /^https?:\/\/[^/]+\/[^/]+\/[^/]+\/pull\/\d+/.test(s);

/**
 * Parses a GitHub PR URL into structured components.
 *
 * Supports:
 * - `https://github.com/owner/repo/pull/42`
 * - `https://github.com/owner/repo/pull/42/files`
 * - `https://github.com/owner/repo/pull/42/commits`
 * - `https://ghe.corp.com/owner/repo/pull/42`
 * - `http://...` (for GHE behind VPN)
 *
 * Does NOT support:
 * - SSH URLs, API URLs, short references like `owner/repo#42`
 */
export const parsePrUrl = Effect.fn("parsePrUrl")(function* (raw: string) {
  const url = yield* Effect.try({
    catch: () =>
      new InvalidPrUrl({
        message:
          "Not a valid URL. Expected: https://github.com/<owner>/<repo>/pull/<number>",
        url: raw,
      }),
    try: () => new URL(raw),
  });

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return yield* new InvalidPrUrl({
      message: `Unsupported protocol: ${url.protocol}. Expected https:// or http://`,
      url: raw,
    });
  }

  // Path: /owner/repo/pull/123[/files|/commits|...]
  const segments = url.pathname.split("/").filter(Boolean);

  if (segments.length < 4 || segments[2] !== "pull") {
    return yield* new InvalidPrUrl({
      message: "URL path must match /<owner>/<repo>/pull/<number>",
      url: raw,
    });
  }

  const owner = segments[0]!;
  const repo = segments[1]!;
  const prNumber = Number.parseInt(segments[3]!, 10);

  if (!Number.isFinite(prNumber) || prNumber <= 0) {
    return yield* new InvalidPrUrl({
      message: `Invalid PR number: ${segments[3]}`,
      url: raw,
    });
  }

  return {
    host: url.host,
    nwoRef: `${owner}/${repo}`,
    owner,
    prNumber,
    repo,
    url: `${url.protocol}//${url.host}/${owner}/${repo}/pull/${prNumber}`,
  } satisfies PrTarget;
});
