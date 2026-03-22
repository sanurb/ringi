import * as HttpApiBuilder from "@effect/platform/HttpApiBuilder";
import * as Effect from "effect/Effect";

import { DomainApi } from "@/api/domain-api";
import { CommentService } from "@/core/services/comment.service";

export const CommentsApiLive = HttpApiBuilder.group(
  DomainApi,
  "comments",
  (handlers) =>
    handlers
      .handle("getByReview", (_) =>
        Effect.gen(function* CommentsApiLive() {
          const svc = yield* CommentService;
          const { filePath } = _.urlParams;
          if (filePath) {
            return yield* svc.getByFile(_.path.reviewId, filePath);
          }
          return yield* svc.getByReview(_.path.reviewId);
        })
      )
      .handle("getById", (_) =>
        Effect.gen(function* CommentsApiLive() {
          const svc = yield* CommentService;
          return yield* svc.getById(_.path.id);
        })
      )
      .handle("create", (_) =>
        Effect.gen(function* CommentsApiLive() {
          const svc = yield* CommentService;
          return yield* svc.create(_.path.reviewId, _.payload);
        })
      )
      .handle("update", (_) =>
        Effect.gen(function* CommentsApiLive() {
          const svc = yield* CommentService;
          return yield* svc.update(_.path.id, _.payload);
        })
      )
      .handle("resolve", (_) =>
        Effect.gen(function* CommentsApiLive() {
          const svc = yield* CommentService;
          return yield* svc.resolve(_.path.id);
        })
      )
      .handle("unresolve", (_) =>
        Effect.gen(function* CommentsApiLive() {
          const svc = yield* CommentService;
          return yield* svc.unresolve(_.path.id);
        })
      )
      .handle("remove", (_) =>
        Effect.gen(function* CommentsApiLive() {
          const svc = yield* CommentService;
          return yield* svc.remove(_.path.id);
        })
      )
      .handle("stats", (_) =>
        Effect.gen(function* CommentsApiLive() {
          const svc = yield* CommentService;
          return yield* svc.getStats(_.path.reviewId);
        })
      )
);
