import * as Schema from "effect/Schema";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "effect/unstable/httpapi";

import { CreateAnnotationInput, ReviewAnnotation } from "../schemas/annotation";
import {
  Comment,
  CommentId,
  CommentNotFound,
  CreateCommentInput,
  UpdateCommentInput,
} from "../schemas/comment";
import { CoverageSummary } from "../schemas/coverage";
import { DiffFile, DiffHunk, DiffSummary } from "../schemas/diff";
import { ReviewFeedback } from "../schemas/feedback";
import { BranchInfo, CommitInfo, RepositoryInfo } from "../schemas/git";
import {
  CreateReviewInput,
  DIFF_SCOPES,
  Review,
  ReviewId,
  ReviewNotFound,
  UpdateReviewInput,
} from "../schemas/review";
import {
  CreateTodoInput,
  Todo,
  TodoId,
  TodoNotFound,
  UpdateTodoInput,
} from "../schemas/todo";
import { ReviewContextMode } from "../services/context-builder.service";

// ── Reviews ────────────────────────────────────────────────────
export class ReviewsApiGroup extends HttpApiGroup.make("reviews").add(
  HttpApiEndpoint.get("list", "/reviews", {
    success: Schema.Struct({
      page: Schema.Number,
      pageSize: Schema.Number,
      reviews: Schema.Array(Review),
      total: Schema.Number,
    }),
  }),
  HttpApiEndpoint.get("getById", "/reviews/:id", {
    params: { id: ReviewId },
    success: Review,
    error: HttpApiSchema.status(404)(ReviewNotFound),
  }),
  HttpApiEndpoint.post("create", "/reviews", {
    payload: CreateReviewInput,
    success: Review,
  }),
  HttpApiEndpoint.patch("update", "/reviews/:id", {
    params: { id: ReviewId },
    payload: UpdateReviewInput,
    success: Review,
    error: HttpApiSchema.status(404)(ReviewNotFound),
  }),
  HttpApiEndpoint.delete("remove", "/reviews/:id", {
    params: { id: ReviewId },
    success: Schema.Struct({ success: Schema.Literal(true) }),
    error: HttpApiSchema.status(404)(ReviewNotFound),
  }),
  HttpApiEndpoint.get("stats", "/reviews/stats", {
    success: Schema.Struct({
      approved: Schema.Number,
      changesRequested: Schema.Number,
      inProgress: Schema.Number,
      total: Schema.Number,
    }),
  })
) {}

// ── Review Files (hunks) ──────────────────────────────────────
export class ReviewFilesApiGroup extends HttpApiGroup.make("reviewFiles").add(
  HttpApiEndpoint.get("hunks", "/reviews/:reviewId/files/hunks", {
    params: { reviewId: ReviewId },
    query: { path: Schema.String },
    success: Schema.Struct({ hunks: Schema.Array(DiffHunk) }),
    error: HttpApiSchema.status(404)(ReviewNotFound),
  })
) {}

// ── Diff ──────────────────────────────────────────────────────
const DiffResponse = Schema.Struct({
  files: Schema.Array(DiffFile),
  repository: RepositoryInfo,
  summary: DiffSummary,
});

const DiffScopeSchema = Schema.Literals(DIFF_SCOPES);

export class DiffApiGroup extends HttpApiGroup.make("diff").add(
  HttpApiEndpoint.get("staged", "/diff/staged", {
    success: DiffResponse,
  }),
  HttpApiEndpoint.get("unstaged", "/diff/unstaged", {
    success: DiffResponse,
  }),
  HttpApiEndpoint.get("scoped", "/diff/scoped", {
    query: { scope: DiffScopeSchema },
    success: DiffResponse,
  }),
  HttpApiEndpoint.get("files", "/diff/files", {
    success: Schema.Struct({
      files: Schema.Array(
        Schema.Struct({ path: Schema.String, status: Schema.String })
      ),
      hasStagedChanges: Schema.Boolean,
    }),
  })
) {}

// ── Git ──────────────────────────────────────────────────────
export class GitApiGroup extends HttpApiGroup.make("git").add(
  HttpApiEndpoint.get("info", "/git/info", {
    success: RepositoryInfo,
  }),
  HttpApiEndpoint.get("branches", "/git/branches", {
    success: Schema.Array(BranchInfo),
  }),
  HttpApiEndpoint.get("commits", "/git/commits", {
    success: Schema.Struct({
      commits: Schema.Array(CommitInfo),
      hasMore: Schema.Boolean,
    }),
  }),
  HttpApiEndpoint.get("staged", "/git/staged", {
    success: Schema.Struct({ hasStagedChanges: Schema.Boolean }),
  }),
  HttpApiEndpoint.post("stage", "/git/stage", {
    payload: Schema.Struct({ files: Schema.Array(Schema.String) }),
    success: Schema.Struct({
      staged: Schema.Array(Schema.String),
      success: Schema.Boolean,
    }),
  }),
  HttpApiEndpoint.post("stageAll", "/git/stage-all", {
    success: Schema.Struct({
      staged: Schema.Array(Schema.String),
      success: Schema.Boolean,
    }),
  }),
  HttpApiEndpoint.post("unstage", "/git/unstage", {
    payload: Schema.Struct({ files: Schema.Array(Schema.String) }),
    success: Schema.Struct({
      success: Schema.Boolean,
      unstaged: Schema.Array(Schema.String),
    }),
  })
) {}

// ── Comments ─────────────────────────────────────────────────
export class CommentsApiGroup extends HttpApiGroup.make("comments").add(
  HttpApiEndpoint.get("getByReview", "/reviews/:reviewId/comments", {
    params: { reviewId: ReviewId },
    query: {
      filePath: Schema.optional(Schema.String),
    },
    success: Schema.Array(Comment),
  }),
  HttpApiEndpoint.get("getById", "/comments/:id", {
    params: { id: CommentId },
    success: Comment,
    error: HttpApiSchema.status(404)(CommentNotFound),
  }),
  HttpApiEndpoint.post("create", "/reviews/:reviewId/comments", {
    params: { reviewId: ReviewId },
    payload: CreateCommentInput,
    success: Comment,
    error: HttpApiSchema.status(404)(ReviewNotFound),
  }),
  HttpApiEndpoint.patch("update", "/comments/:id", {
    params: { id: CommentId },
    payload: UpdateCommentInput,
    success: Comment,
    error: HttpApiSchema.status(404)(CommentNotFound),
  }),
  HttpApiEndpoint.post("resolve", "/comments/:id/resolve", {
    params: { id: CommentId },
    success: Comment,
    error: HttpApiSchema.status(404)(CommentNotFound),
  }),
  HttpApiEndpoint.post("unresolve", "/comments/:id/unresolve", {
    params: { id: CommentId },
    success: Comment,
    error: HttpApiSchema.status(404)(CommentNotFound),
  }),
  HttpApiEndpoint.delete("remove", "/comments/:id", {
    params: { id: CommentId },
    success: Schema.Struct({ success: Schema.Literal(true) }),
    error: HttpApiSchema.status(404)(CommentNotFound),
  }),
  HttpApiEndpoint.get("stats", "/reviews/:reviewId/comments/stats", {
    params: { reviewId: ReviewId },
    success: Schema.Struct({
      resolved: Schema.Number,
      total: Schema.Number,
      unresolved: Schema.Number,
      withSuggestions: Schema.Number,
    }),
  })
) {}

// ── Todos ───────────────────────────────────────────────────
export class TodosApiGroup extends HttpApiGroup.make("todos").add(
  HttpApiEndpoint.get("list", "/todos", {
    success: Schema.Struct({
      data: Schema.Array(Todo),
      limit: Schema.NullOr(Schema.Number),
      offset: Schema.Number,
      total: Schema.Number,
    }),
  }),
  HttpApiEndpoint.get("getById", "/todos/:id", {
    params: { id: TodoId },
    success: Todo,
    error: HttpApiSchema.status(404)(TodoNotFound),
  }),
  HttpApiEndpoint.post("create", "/todos", {
    payload: CreateTodoInput,
    success: Todo,
  }),
  HttpApiEndpoint.patch("update", "/todos/:id", {
    params: { id: TodoId },
    payload: UpdateTodoInput,
    success: Todo,
    error: HttpApiSchema.status(404)(TodoNotFound),
  }),
  HttpApiEndpoint.patch("toggle", "/todos/:id/toggle", {
    params: { id: TodoId },
    success: Todo,
    error: HttpApiSchema.status(404)(TodoNotFound),
  }),
  HttpApiEndpoint.delete("remove", "/todos/:id", {
    params: { id: TodoId },
    success: Schema.Struct({ success: Schema.Literal(true) }),
    error: HttpApiSchema.status(404)(TodoNotFound),
  }),
  HttpApiEndpoint.delete("removeCompleted", "/todos/completed", {
    success: Schema.Struct({ deleted: Schema.Number }),
  }),
  HttpApiEndpoint.post("reorder", "/todos/reorder", {
    payload: Schema.Struct({ orderedIds: Schema.Array(Schema.String) }),
    success: Schema.Struct({ updated: Schema.Number }),
  }),
  HttpApiEndpoint.patch("move", "/todos/:id/move", {
    params: { id: TodoId },
    payload: Schema.Struct({ position: Schema.Number }),
    success: Todo,
    error: HttpApiSchema.status(404)(TodoNotFound),
  }),
  HttpApiEndpoint.get("stats", "/todos/stats", {
    success: Schema.Struct({
      completed: Schema.Number,
      pending: Schema.Number,
      total: Schema.Number,
    }),
  })
) {}

// ── Events ─────────────────────────────────────────────────
export class EventsApiGroup extends HttpApiGroup.make("events").add(
  HttpApiEndpoint.post("notify", "/events/notify", {
    payload: Schema.Struct({
      action: Schema.optional(
        Schema.Literals(["created", "updated", "deleted"])
      ),
      type: Schema.Literals(["todos", "reviews", "comments", "files"]),
    }),
    success: Schema.Struct({ success: Schema.Boolean }),
  }),
  HttpApiEndpoint.get("clients", "/events/clients", {
    success: Schema.Struct({ count: Schema.Number }),
  })
) {}

// ── Export ──────────────────────────────────────────────────
export class ExportApiGroup extends HttpApiGroup.make("export").add(
  HttpApiEndpoint.get("markdown", "/reviews/:id/export/markdown", {
    params: { id: ReviewId },
    success: Schema.String,
    error: HttpApiSchema.status(404)(ReviewNotFound),
  }),
  HttpApiEndpoint.get("feedback", "/reviews/:id/feedback", {
    params: { id: ReviewId },
    success: ReviewFeedback,
    error: HttpApiSchema.status(404)(ReviewNotFound),
  })
) {}

// ── Annotations ──────────────────────────────────────────────
export class AnnotationsApiGroup extends HttpApiGroup.make("annotations").add(
  HttpApiEndpoint.post("create", "/reviews/:reviewId/annotations", {
    params: { reviewId: ReviewId },
    payload: Schema.Struct({
      annotations: Schema.Array(CreateAnnotationInput),
    }),
    success: Schema.Array(ReviewAnnotation),
    error: HttpApiSchema.status(404)(ReviewNotFound),
  }),
  HttpApiEndpoint.get("list", "/reviews/:reviewId/annotations", {
    params: { reviewId: ReviewId },
    query: {
      filePath: Schema.optional(Schema.String),
    },
    success: Schema.Array(ReviewAnnotation),
  }),
  HttpApiEndpoint.get("stats", "/reviews/:reviewId/annotations/stats", {
    params: { reviewId: ReviewId },
    success: Schema.Struct({
      bySource: Schema.Record(Schema.String, Schema.Number),
      total: Schema.Number,
    }),
  }),
  HttpApiEndpoint.delete("clearBySource", "/reviews/:reviewId/annotations", {
    params: { reviewId: ReviewId },
    query: { source: Schema.String },
    success: Schema.Struct({ deleted: Schema.Number }),
  }),
  HttpApiEndpoint.delete(
    "removeById",
    "/reviews/:reviewId/annotations/:annId",
    {
      params: { reviewId: ReviewId, annId: Schema.String },
      success: Schema.Struct({ success: Schema.Boolean }),
    }
  )
) {}

// ── Coverage ──────────────────────────────────────────────────
export class CoverageApiGroup extends HttpApiGroup.make("coverage").add(
  HttpApiEndpoint.get("summary", "/reviews/:reviewId/coverage", {
    params: { reviewId: ReviewId },
    success: CoverageSummary,
    error: HttpApiSchema.status(404)(ReviewNotFound),
  }),
  HttpApiEndpoint.post("mark", "/reviews/:reviewId/coverage/mark", {
    params: { reviewId: ReviewId },
    payload: Schema.Struct({
      hunkStableId: Schema.String,
      startLine: Schema.NullOr(Schema.Number).pipe(
        Schema.optionalKey,
        Schema.withDecodingDefaultKey(() => null)
      ),
      endLine: Schema.NullOr(Schema.Number).pipe(
        Schema.optionalKey,
        Schema.withDecodingDefaultKey(() => null)
      ),
    }),
    success: Schema.Struct({ success: Schema.Literal(true) }),
    error: HttpApiSchema.status(404)(ReviewNotFound),
  }),
  HttpApiEndpoint.delete(
    "unmark",
    "/reviews/:reviewId/coverage/:hunkStableId",
    {
      params: { reviewId: ReviewId, hunkStableId: Schema.String },
      success: Schema.Struct({ success: Schema.Literal(true) }),
      error: HttpApiSchema.status(404)(ReviewNotFound),
    }
  )
) {}

// ── Health ──────────────────────────────────────────────────
export class HealthApiGroup extends HttpApiGroup.make("health").add(
  HttpApiEndpoint.get("check", "/health", {
    success: Schema.Struct({ ok: Schema.Literal(true) }),
  })
) {}

// ── Context ─────────────────────────────────────────────────
export class ContextApiGroup extends HttpApiGroup.make("context").add(
  HttpApiEndpoint.get("build", "/reviews/:reviewId/context", {
    params: { reviewId: ReviewId },
    query: {
      mode: ReviewContextMode,
      filePath: Schema.optional(Schema.String),
    },
    success: Schema.Struct({
      context: Schema.String,
      mode: ReviewContextMode,
      reviewId: ReviewId,
    }),
    error: HttpApiSchema.status(404)(ReviewNotFound),
  })
) {}

// ── Domain API ─────────────────────────────────────────────────
export class DomainApi extends HttpApi.make("api")
  .add(ReviewsApiGroup)
  .add(ReviewFilesApiGroup)
  .add(CommentsApiGroup)
  .add(TodosApiGroup)
  .add(AnnotationsApiGroup)
  .add(CoverageApiGroup)
  .add(DiffApiGroup)
  .add(GitApiGroup)
  .add(EventsApiGroup)
  .add(ExportApiGroup)
  .add(ContextApiGroup)
  .add(HealthApiGroup)
  .prefix("/api") {}
