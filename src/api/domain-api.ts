import * as HttpApi from "@effect/platform/HttpApi";
import * as HttpApiEndpoint from "@effect/platform/HttpApiEndpoint";
import * as HttpApiGroup from "@effect/platform/HttpApiGroup";
import * as Schema from "effect/Schema";

import {
  Comment,
  CommentId,
  CommentNotFound,
  CreateCommentInput,
  UpdateCommentInput,
} from "./schemas/comment";
import { DiffFile, DiffHunk, DiffSummary } from "./schemas/diff";
import { BranchInfo, CommitInfo, RepositoryInfo } from "./schemas/git";
import {
  CreateReviewInput,
  DIFF_SCOPES,
  Review,
  ReviewId,
  ReviewNotFound,
  UpdateReviewInput,
} from "./schemas/review";
import {
  CreateTodoInput,
  Todo,
  TodoId,
  TodoNotFound,
  UpdateTodoInput,
} from "./schemas/todo";

// ── Reviews ────────────────────────────────────────────────────
export class ReviewsApiGroup extends HttpApiGroup.make("reviews")
  .add(
    HttpApiEndpoint.get("list", "/reviews").addSuccess(
      Schema.Struct({
        page: Schema.Number,
        pageSize: Schema.Number,
        reviews: Schema.Array(Review),
        total: Schema.Number,
      })
    )
  )
  .add(
    HttpApiEndpoint.get("getById", "/reviews/:id")
      .setPath(Schema.Struct({ id: ReviewId }))
      .addSuccess(Review)
      .addError(ReviewNotFound)
  )
  .add(
    HttpApiEndpoint.post("create", "/reviews")
      .setPayload(CreateReviewInput)
      .addSuccess(Review)
  )
  .add(
    HttpApiEndpoint.patch("update", "/reviews/:id")
      .setPath(Schema.Struct({ id: ReviewId }))
      .setPayload(UpdateReviewInput)
      .addSuccess(Review)
      .addError(ReviewNotFound)
  )
  .add(
    HttpApiEndpoint.del("remove", "/reviews/:id")
      .setPath(Schema.Struct({ id: ReviewId }))
      .addSuccess(Schema.Struct({ success: Schema.Literal(true) }))
      .addError(ReviewNotFound)
  )
  .add(
    HttpApiEndpoint.get("stats", "/reviews/stats").addSuccess(
      Schema.Struct({
        approved: Schema.Number,
        changesRequested: Schema.Number,
        inProgress: Schema.Number,
        total: Schema.Number,
      })
    )
  ) {}

// ── Review Files (hunks) ──────────────────────────────────────
export class ReviewFilesApiGroup extends HttpApiGroup.make("reviewFiles").add(
  HttpApiEndpoint.get("hunks", "/reviews/:reviewId/files/hunks")
    .setPath(Schema.Struct({ reviewId: ReviewId }))
    .setUrlParams(Schema.Struct({ path: Schema.String }))
    .addSuccess(Schema.Struct({ hunks: Schema.Array(DiffHunk) }))
    .addError(ReviewNotFound)
) {}

// ── Diff ──────────────────────────────────────────────────────
const DiffResponse = Schema.Struct({
  files: Schema.Array(DiffFile),
  repository: RepositoryInfo,
  summary: DiffSummary,
});

const DiffScopeSchema = Schema.Literal(...DIFF_SCOPES);

export class DiffApiGroup extends HttpApiGroup.make("diff")
  .add(HttpApiEndpoint.get("staged", "/diff/staged").addSuccess(DiffResponse))
  .add(
    HttpApiEndpoint.get("unstaged", "/diff/unstaged").addSuccess(DiffResponse)
  )
  .add(
    HttpApiEndpoint.get("scoped", "/diff/scoped")
      .setUrlParams(Schema.Struct({ scope: DiffScopeSchema }))
      .addSuccess(DiffResponse)
  )
  .add(
    HttpApiEndpoint.get("files", "/diff/files").addSuccess(
      Schema.Struct({
        files: Schema.Array(
          Schema.Struct({ path: Schema.String, status: Schema.String })
        ),
        hasStagedChanges: Schema.Boolean,
      })
    )
  ) {}

// ── Git ──────────────────────────────────────────────────────
export class GitApiGroup extends HttpApiGroup.make("git")
  .add(HttpApiEndpoint.get("info", "/git/info").addSuccess(RepositoryInfo))
  .add(
    HttpApiEndpoint.get("branches", "/git/branches").addSuccess(
      Schema.Array(BranchInfo)
    )
  )
  .add(
    HttpApiEndpoint.get("commits", "/git/commits").addSuccess(
      Schema.Struct({
        commits: Schema.Array(CommitInfo),
        hasMore: Schema.Boolean,
      })
    )
  )
  .add(
    HttpApiEndpoint.get("staged", "/git/staged").addSuccess(
      Schema.Struct({ hasStagedChanges: Schema.Boolean })
    )
  )
  .add(
    HttpApiEndpoint.post("stage", "/git/stage")
      .setPayload(Schema.Struct({ files: Schema.Array(Schema.String) }))
      .addSuccess(
        Schema.Struct({
          staged: Schema.Array(Schema.String),
          success: Schema.Boolean,
        })
      )
  )
  .add(
    HttpApiEndpoint.post("stageAll", "/git/stage-all").addSuccess(
      Schema.Struct({
        staged: Schema.Array(Schema.String),
        success: Schema.Boolean,
      })
    )
  )
  .add(
    HttpApiEndpoint.post("unstage", "/git/unstage")
      .setPayload(Schema.Struct({ files: Schema.Array(Schema.String) }))
      .addSuccess(
        Schema.Struct({
          success: Schema.Boolean,
          unstaged: Schema.Array(Schema.String),
        })
      )
  ) {}

// ── Comments ─────────────────────────────────────────────────
export class CommentsApiGroup extends HttpApiGroup.make("comments")
  .add(
    HttpApiEndpoint.get("getByReview", "/reviews/:reviewId/comments")
      .setPath(Schema.Struct({ reviewId: ReviewId }))
      .setUrlParams(
        Schema.Struct({
          filePath: Schema.optionalWith(Schema.String, { default: () => "" }),
        })
      )
      .addSuccess(Schema.Array(Comment))
  )
  .add(
    HttpApiEndpoint.get("getById", "/comments/:id")
      .setPath(Schema.Struct({ id: CommentId }))
      .addSuccess(Comment)
      .addError(CommentNotFound)
  )
  .add(
    HttpApiEndpoint.post("create", "/reviews/:reviewId/comments")
      .setPath(Schema.Struct({ reviewId: ReviewId }))
      .setPayload(CreateCommentInput)
      .addSuccess(Comment)
      .addError(ReviewNotFound)
  )
  .add(
    HttpApiEndpoint.patch("update", "/comments/:id")
      .setPath(Schema.Struct({ id: CommentId }))
      .setPayload(UpdateCommentInput)
      .addSuccess(Comment)
      .addError(CommentNotFound)
  )
  .add(
    HttpApiEndpoint.post("resolve", "/comments/:id/resolve")
      .setPath(Schema.Struct({ id: CommentId }))
      .addSuccess(Comment)
      .addError(CommentNotFound)
  )
  .add(
    HttpApiEndpoint.post("unresolve", "/comments/:id/unresolve")
      .setPath(Schema.Struct({ id: CommentId }))
      .addSuccess(Comment)
      .addError(CommentNotFound)
  )
  .add(
    HttpApiEndpoint.del("remove", "/comments/:id")
      .setPath(Schema.Struct({ id: CommentId }))
      .addSuccess(Schema.Struct({ success: Schema.Literal(true) }))
      .addError(CommentNotFound)
  )
  .add(
    HttpApiEndpoint.get("stats", "/reviews/:reviewId/comments/stats")
      .setPath(Schema.Struct({ reviewId: ReviewId }))
      .addSuccess(
        Schema.Struct({
          resolved: Schema.Number,
          total: Schema.Number,
          unresolved: Schema.Number,
          withSuggestions: Schema.Number,
        })
      )
  ) {}

// ── Todos ───────────────────────────────────────────────────
export class TodosApiGroup extends HttpApiGroup.make("todos")
  .add(
    HttpApiEndpoint.get("list", "/todos").addSuccess(
      Schema.Struct({
        data: Schema.Array(Todo),
        limit: Schema.NullOr(Schema.Number),
        offset: Schema.Number,
        total: Schema.Number,
      })
    )
  )
  .add(
    HttpApiEndpoint.get("getById", "/todos/:id")
      .setPath(Schema.Struct({ id: TodoId }))
      .addSuccess(Todo)
      .addError(TodoNotFound)
  )
  .add(
    HttpApiEndpoint.post("create", "/todos")
      .setPayload(CreateTodoInput)
      .addSuccess(Todo)
  )
  .add(
    HttpApiEndpoint.patch("update", "/todos/:id")
      .setPath(Schema.Struct({ id: TodoId }))
      .setPayload(UpdateTodoInput)
      .addSuccess(Todo)
      .addError(TodoNotFound)
  )
  .add(
    HttpApiEndpoint.patch("toggle", "/todos/:id/toggle")
      .setPath(Schema.Struct({ id: TodoId }))
      .addSuccess(Todo)
      .addError(TodoNotFound)
  )
  .add(
    HttpApiEndpoint.del("remove", "/todos/:id")
      .setPath(Schema.Struct({ id: TodoId }))
      .addSuccess(Schema.Struct({ success: Schema.Literal(true) }))
      .addError(TodoNotFound)
  )
  .add(
    HttpApiEndpoint.del("removeCompleted", "/todos/completed").addSuccess(
      Schema.Struct({ deleted: Schema.Number })
    )
  )
  .add(
    HttpApiEndpoint.post("reorder", "/todos/reorder")
      .setPayload(Schema.Struct({ orderedIds: Schema.Array(Schema.String) }))
      .addSuccess(Schema.Struct({ updated: Schema.Number }))
  )
  .add(
    HttpApiEndpoint.patch("move", "/todos/:id/move")
      .setPath(Schema.Struct({ id: TodoId }))
      .setPayload(Schema.Struct({ position: Schema.Number }))
      .addSuccess(Todo)
      .addError(TodoNotFound)
  )
  .add(
    HttpApiEndpoint.get("stats", "/todos/stats").addSuccess(
      Schema.Struct({
        completed: Schema.Number,
        pending: Schema.Number,
        total: Schema.Number,
      })
    )
  ) {}

// ── Events ─────────────────────────────────────────────────
export class EventsApiGroup extends HttpApiGroup.make("events")
  .add(
    HttpApiEndpoint.post("notify", "/events/notify")
      .setPayload(
        Schema.Struct({
          action: Schema.optionalWith(
            Schema.Literal("created", "updated", "deleted"),
            { as: "Option" }
          ),
          type: Schema.Literal("todos", "reviews", "comments", "files"),
        })
      )
      .addSuccess(Schema.Struct({ success: Schema.Boolean }))
  )
  .add(
    HttpApiEndpoint.get("clients", "/events/clients").addSuccess(
      Schema.Struct({ count: Schema.Number })
    )
  ) {}

// ── Export ──────────────────────────────────────────────────
export class ExportApiGroup extends HttpApiGroup.make("export").add(
  HttpApiEndpoint.get("markdown", "/reviews/:id/export/markdown")
    .setPath(Schema.Struct({ id: ReviewId }))
    .addSuccess(Schema.String)
    .addError(ReviewNotFound)
) {}

// ── Domain API ─────────────────────────────────────────────────
export class DomainApi extends HttpApi.make("api")
  .add(ReviewsApiGroup)
  .add(ReviewFilesApiGroup)
  .add(CommentsApiGroup)
  .add(TodosApiGroup)
  .add(DiffApiGroup)
  .add(GitApiGroup)
  .add(EventsApiGroup)
  .add(ExportApiGroup)
  .prefix("/api") {}
