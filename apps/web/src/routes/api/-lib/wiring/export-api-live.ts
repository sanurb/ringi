import { DomainApi } from "@ringi/core/api/domain-api";
import type { ReviewId } from "@ringi/core/schemas/review";
import { CommentService } from "@ringi/core/services/comment.service";
import { ExportService } from "@ringi/core/services/export.service";
import { ReviewService } from "@ringi/core/services/review.service";
import { TodoService } from "@ringi/core/services/todo.service";
import * as Effect from "effect/Effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

import { formatReviewFeedback } from "@/lib/format-review-feedback";
import type { ExportableComment } from "@/lib/format-review-feedback";

export const ExportApiLive = HttpApiBuilder.group(
  DomainApi,
  "export",
  (handlers) =>
    handlers
      .handle("markdown", (_) =>
        Effect.gen(function* () {
          const svc = yield* ExportService;
          return yield* svc.exportReview(_.params.id);
        })
      )
      .handle("feedback", (_) =>
        Effect.gen(function* () {
          const reviewService = yield* ReviewService;
          const commentService = yield* CommentService;
          const todoService = yield* TodoService;

          const review = yield* reviewService.getById(_.params.id as ReviewId);
          const comments = yield* commentService.getByReview(
            _.params.id as ReviewId
          );
          const todos = yield* todoService.list({
            reviewId: _.params.id as string,
          });

          const exportable: ExportableComment[] = comments.map((c: any) => ({
            content: c.content,
            filePath: c.filePath,
            lineNumber: c.lineNumber,
            lineType: c.lineType,
            suggestion: c.suggestion,
          }));

          const markdown = formatReviewFeedback(exportable);

          return {
            commentCount: comments.length,
            markdown,
            reviewId: review.id,
            status: review.status,
            todoCount: todos.total,
          };
        })
      )
);
