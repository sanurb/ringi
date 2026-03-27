import { spawn } from "node:child_process";

import { ServiceMap } from "effect";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import type { PrMetadata, PrTarget } from "../schemas/pr";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class GhNotInstalled extends Schema.TaggedErrorClass<GhNotInstalled>()(
  "GhNotInstalled",
  { message: Schema.String }
) {}

export class GhAuthError extends Schema.TaggedErrorClass<GhAuthError>()(
  "GhAuthError",
  {
    host: Schema.String,
    message: Schema.String,
  }
) {}

export class GhApiError extends Schema.TaggedErrorClass<GhApiError>()(
  "GhApiError",
  {
    message: Schema.String,
    statusCode: Schema.NullOr(Schema.Number),
  }
) {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Max bytes to collect from gh output (50 MB — PR diffs can be large). */
const MAX_STDOUT_BYTES = 50 * 1024 * 1024;

const execGh = (args: readonly string[]) =>
  Effect.tryPromise({
    catch: (error) =>
      new GhApiError({ message: String(error), statusCode: null }),
    try: () =>
      new Promise<string>((resolve, reject) => {
        const child = spawn("gh", [...args], {
          stdio: ["ignore", "pipe", "pipe"],
        });

        const chunks: Buffer[] = [];
        let bytes = 0;
        let truncated = false;

        child.stdout.on("data", (chunk: Buffer) => {
          if (truncated) return;
          bytes += chunk.length;
          if (bytes > MAX_STDOUT_BYTES) {
            truncated = true;
            child.kill();
            return;
          }
          chunks.push(chunk);
        });

        let stderr = "";
        child.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString();
        });

        child.on("error", (err) => {
          reject(new Error(`Failed to spawn gh: ${err.message}`));
        });

        child.on("close", (code) => {
          if (truncated) {
            resolve(Buffer.concat(chunks).toString("utf8"));
            return;
          }
          if (code !== 0) {
            reject(
              new Error(`gh ${args[0]} exited with code ${code}: ${stderr}`)
            );
          } else {
            resolve(Buffer.concat(chunks).toString("utf8"));
          }
        });
      }),
  });

/** PR metadata fields requested from gh in a single JSON call. */
const PR_JSON_FIELDS = [
  "additions",
  "author",
  "baseRefName",
  "baseRefOid",
  "body",
  "changedFiles",
  "createdAt",
  "deletions",
  "headRefName",
  "headRefOid",
  "headRepository",
  "isDraft",
  "mergeable",
  "number",
  "reviewDecision",
  "state",
  "title",
  "updatedAt",
  "url",
].join(",");

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

interface GhServiceShape {
  /** Verify `gh` CLI is installed and reachable. */
  readonly ensureInstalled: Effect.Effect<void, GhNotInstalled>;

  /** Verify authentication for a specific host. */
  ensureAuthenticated(host: string): Effect.Effect<void, GhAuthError>;

  /** Fetch full PR metadata as typed JSON. */
  fetchPrMetadata(target: PrTarget): Effect.Effect<PrMetadata, GhApiError>;

  /** Fetch PR diff as unified diff text. */
  fetchPrDiff(target: PrTarget): Effect.Effect<string, GhApiError>;

  /** Quick-check current head SHA without full metadata fetch. */
  fetchPrHeadOid(target: PrTarget): Effect.Effect<string, GhApiError>;
}

export class GhService extends ServiceMap.Service<GhService, GhServiceShape>()(
  "@ringi/GhService"
) {
  static readonly Default: Layer.Layer<GhService> = Layer.effect(
    GhService,
    Effect.gen(function* () {
      const ensureInstalled = execGh(["version"]).pipe(
        Effect.asVoid,
        Effect.mapError(
          () =>
            new GhNotInstalled({
              message:
                "GitHub CLI (gh) not found. Install: https://cli.github.com",
            })
        ),
        Effect.withSpan("GhService.ensureInstalled")
      );

      const ensureAuthenticated = Effect.fn("GhService.ensureAuthenticated")(
        function* (host: string) {
          yield* execGh(["auth", "status", "--hostname", host]).pipe(
            Effect.asVoid,
            Effect.mapError(
              () =>
                new GhAuthError({
                  host,
                  message: `Not authenticated to ${host}. Run: gh auth login --hostname ${host}`,
                })
            )
          );
        }
      );

      const fetchPrMetadata = Effect.fn("GhService.fetchPrMetadata")(function* (
        target: PrTarget
      ) {
        const json = yield* execGh([
          "pr",
          "view",
          String(target.prNumber),
          "--repo",
          target.nwoRef,
          "--json",
          PR_JSON_FIELDS,
        ]);

        return yield* Effect.try({
          catch: () =>
            new GhApiError({
              message: "Failed to parse PR metadata JSON from gh output",
              statusCode: null,
            }),
          try: () => JSON.parse(json) as PrMetadata,
        });
      });

      const fetchPrDiff = Effect.fn("GhService.fetchPrDiff")(function* (
        target: PrTarget
      ) {
        return yield* execGh([
          "pr",
          "diff",
          String(target.prNumber),
          "--repo",
          target.nwoRef,
        ]);
      });

      const fetchPrHeadOid = Effect.fn("GhService.fetchPrHeadOid")(function* (
        target: PrTarget
      ) {
        const json = yield* execGh([
          "pr",
          "view",
          String(target.prNumber),
          "--repo",
          target.nwoRef,
          "--json",
          "headRefOid",
        ]);

        return yield* Effect.try({
          catch: () =>
            new GhApiError({
              message: "Failed to parse head OID from gh output",
              statusCode: null,
            }),
          try: () => (JSON.parse(json) as { headRefOid: string }).headRefOid,
        });
      });

      return GhService.of({
        ensureAuthenticated,
        ensureInstalled,
        fetchPrDiff,
        fetchPrHeadOid,
        fetchPrMetadata,
      });
    })
  );
}
