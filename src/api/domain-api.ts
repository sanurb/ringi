import * as HttpApi from "@effect/platform/HttpApi";
import * as HttpApiGroup from "@effect/platform/HttpApiGroup";
import * as HttpApiEndpoint from "@effect/platform/HttpApiEndpoint";
import * as Schema from "effect/Schema";
import {
  CreateReviewInput,
  Review,
  ReviewId,
  ReviewNotFound,
  UpdateReviewInput,
} from "./schemas/review";
import { DiffFile, DiffHunk, DiffSummary } from "./schemas/diff";
import { BranchInfo, CommitInfo, RepositoryInfo } from "./schemas/git";

// ── Reviews ────────────────────────────────────────────────────
export class ReviewsApiGroup extends HttpApiGroup.make("reviews")
  .add(
    HttpApiEndpoint.get("list", "/reviews").addSuccess(
      Schema.Struct({
        reviews: Schema.Array(Review),
        total: Schema.Number,
        page: Schema.Number,
        pageSize: Schema.Number,
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("getById", "/reviews/:id")
      .setPath(Schema.Struct({ id: ReviewId }))
      .addSuccess(Review)
      .addError(ReviewNotFound),
  )
  .add(
    HttpApiEndpoint.post("create", "/reviews")
      .setPayload(CreateReviewInput)
      .addSuccess(Review),
  )
  .add(
    HttpApiEndpoint.patch("update", "/reviews/:id")
      .setPath(Schema.Struct({ id: ReviewId }))
      .setPayload(UpdateReviewInput)
      .addSuccess(Review)
      .addError(ReviewNotFound),
  )
  .add(
    HttpApiEndpoint.del("remove", "/reviews/:id")
      .setPath(Schema.Struct({ id: ReviewId }))
      .addSuccess(Schema.Struct({ success: Schema.Literal(true) }))
      .addError(ReviewNotFound),
  )
  .add(
    HttpApiEndpoint.get("stats", "/reviews/stats").addSuccess(
      Schema.Struct({
        total: Schema.Number,
        inProgress: Schema.Number,
        approved: Schema.Number,
        changesRequested: Schema.Number,
      }),
    ),
  ) {}

// ── Review Files (hunks) ──────────────────────────────────────
export class ReviewFilesApiGroup extends HttpApiGroup.make("reviewFiles")
  .add(
    HttpApiEndpoint.get("hunks", "/reviews/:reviewId/files/hunks")
      .setPath(Schema.Struct({ reviewId: ReviewId }))
      .setUrlParams(Schema.Struct({ path: Schema.String }))
      .addSuccess(Schema.Struct({ hunks: Schema.Array(DiffHunk) }))
      .addError(ReviewNotFound),
  ) {}

// ── Diff ──────────────────────────────────────────────────────
export class DiffApiGroup extends HttpApiGroup.make("diff")
  .add(
    HttpApiEndpoint.get("staged", "/diff/staged").addSuccess(
      Schema.Struct({
        files: Schema.Array(DiffFile),
        summary: DiffSummary,
        repository: RepositoryInfo,
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("unstaged", "/diff/unstaged").addSuccess(
      Schema.Struct({
        files: Schema.Array(DiffFile),
        summary: DiffSummary,
        repository: RepositoryInfo,
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("files", "/diff/files").addSuccess(
      Schema.Struct({
        files: Schema.Array(Schema.Struct({ path: Schema.String, status: Schema.String })),
        hasStagedChanges: Schema.Boolean,
      }),
    ),
  ) {}

// ── Git ──────────────────────────────────────────────────────
export class GitApiGroup extends HttpApiGroup.make("git")
  .add(
    HttpApiEndpoint.get("info", "/git/info").addSuccess(RepositoryInfo),
  )
  .add(
    HttpApiEndpoint.get("branches", "/git/branches").addSuccess(
      Schema.Array(BranchInfo),
    ),
  )
  .add(
    HttpApiEndpoint.get("commits", "/git/commits").addSuccess(
      Schema.Struct({
        commits: Schema.Array(CommitInfo),
        hasMore: Schema.Boolean,
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("staged", "/git/staged").addSuccess(
      Schema.Struct({ hasStagedChanges: Schema.Boolean }),
    ),
  )
  .add(
    HttpApiEndpoint.post("stage", "/git/stage")
      .setPayload(Schema.Struct({ files: Schema.Array(Schema.String) }))
      .addSuccess(Schema.Struct({ success: Schema.Boolean, staged: Schema.Array(Schema.String) })),
  )
  .add(
    HttpApiEndpoint.post("stageAll", "/git/stage-all")
      .addSuccess(Schema.Struct({ success: Schema.Boolean, staged: Schema.Array(Schema.String) })),
  )
  .add(
    HttpApiEndpoint.post("unstage", "/git/unstage")
      .setPayload(Schema.Struct({ files: Schema.Array(Schema.String) }))
      .addSuccess(Schema.Struct({ success: Schema.Boolean, unstaged: Schema.Array(Schema.String) })),
  ) {}

// ── Domain API ─────────────────────────────────────────────────
export class DomainApi extends HttpApi.make("api")
  .add(ReviewsApiGroup)
  .add(ReviewFilesApiGroup)
  .add(DiffApiGroup)
  .add(GitApiGroup)
  .prefix("/api") {}
