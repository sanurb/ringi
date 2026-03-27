import * as Schema from "effect/Schema";

// ---------------------------------------------------------------------------
// PR Target (URL parse result)
// ---------------------------------------------------------------------------

export const PrTarget = Schema.Struct({
  /** Hostname, e.g. "github.com" or "ghe.corp.com" (includes port for GHE) */
  host: Schema.String,
  /** Repository owner, e.g. "octocat" */
  owner: Schema.String,
  /** Repository name, e.g. "hello-world" */
  repo: Schema.String,
  /** PR number, e.g. 42 */
  prNumber: Schema.Number,
  /** Name-with-owner ref for `gh --repo`, e.g. "octocat/hello-world" */
  nwoRef: Schema.String,
  /** Normalized canonical URL */
  url: Schema.String,
});
export type PrTarget = typeof PrTarget.Type;

// ---------------------------------------------------------------------------
// PR Metadata (fetched from gh)
// ---------------------------------------------------------------------------

export const PrAuthor = Schema.Struct({
  login: Schema.String,
});
export type PrAuthor = typeof PrAuthor.Type;

export const PrHeadRepository = Schema.Struct({
  name: Schema.String,
  owner: Schema.Struct({ login: Schema.String }),
});
export type PrHeadRepository = typeof PrHeadRepository.Type;

export const PrMetadata = Schema.Struct({
  additions: Schema.Number,
  author: PrAuthor,
  baseRefName: Schema.String,
  baseRefOid: Schema.String,
  body: Schema.String,
  changedFiles: Schema.Number,
  createdAt: Schema.String,
  deletions: Schema.Number,
  headRefName: Schema.String,
  headRefOid: Schema.String,
  headRepository: Schema.NullOr(PrHeadRepository),
  isDraft: Schema.Boolean,
  mergeable: Schema.String,
  number: Schema.Number,
  reviewDecision: Schema.NullOr(Schema.String),
  state: Schema.String,
  title: Schema.String,
  updatedAt: Schema.String,
  url: Schema.String,
});
export type PrMetadata = typeof PrMetadata.Type;

// ---------------------------------------------------------------------------
// PR Session Manifest (stored in snapshotData)
// ---------------------------------------------------------------------------

export const PrSessionManifest = Schema.Struct({
  /** Byte size of the fetched diff, for diagnostics */
  diffByteSize: Schema.Number,
  /** ISO timestamp of when gh data was fetched */
  fetchedAt: Schema.String,
  /** SHA of head commit at time of fetch, for drift detection */
  headOidAtFetch: Schema.String,
  /** PR metadata snapshot */
  metadata: PrMetadata,
  /** Always "pull_request" */
  source: Schema.Literal("pull_request"),
  /** Parsed PR target */
  target: PrTarget,
  /** Schema version for forward compatibility */
  version: Schema.Literal(1),
});
export type PrSessionManifest = typeof PrSessionManifest.Type;

// ---------------------------------------------------------------------------
// Diff Side (for annotation anchoring)
// ---------------------------------------------------------------------------

export const DiffSide = Schema.Literals(["LEFT", "RIGHT"]);
export type DiffSide = typeof DiffSide.Type;
