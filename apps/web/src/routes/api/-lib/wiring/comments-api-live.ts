import { DomainApi } from "@ringi/core/api/domain-api";
import { CommentService } from "@ringi/core/services/comment.service";
import * as Effect from "effect/Effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

export const CommentsApiLive = HttpApiBuilder.group(
  DomainApi,
  "comments",
  (handlers) =>
    handlers
      .handle("getByReview", (_) =>
        Effect.gen(function* CommentsApiLive() {
          const svc = yield* CommentService;
          const { filePath } = _.query;
          if (filePath) {
            return yield* svc.getByFile(_.params.reviewId, filePath);
          }
          return yield* svc.getByReview(_.params.reviewId);
        })
      )
      .handle("getById", (_) =>
        Effect.gen(function* CommentsApiLive() {
          const svc = yield* CommentService;
          return yield* svc.getById(_.params.id);
        })
      )
      .handle("create", (_) =>
        Effect.gen(function* CommentsApiLive() {
          const svc = yield* CommentService;
          return yield* svc.create(_.params.reviewId, _.payload);
        })
      )
      .handle("update", (_) =>
        Effect.gen(function* CommentsApiLive() {
          const svc = yield* CommentService;
          return yield* svc.update(_.params.id, _.payload);
        })
      )
      .handle("resolve", (_) =>
        Effect.gen(function* CommentsApiLive() {
          const svc = yield* CommentService;
          return yield* svc.resolve(_.params.id);
        })
      )
      .handle("unresolve", (_) =>
        Effect.gen(function* CommentsApiLive() {
          const svc = yield* CommentService;
          return yield* svc.unresolve(_.params.id);
        })
      )
      .handle("remove", (_) =>
        Effect.gen(function* CommentsApiLive() {
          const svc = yield* CommentService;
          return yield* svc.remove(_.params.id);
        })
      )
      .handle("stats", (_) =>
        Effect.gen(function* CommentsApiLive() {
          const svc = yield* CommentService;
          return yield* svc.getStats(_.params.reviewId);
        })
      )
);
