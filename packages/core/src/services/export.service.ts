import { ServiceMap } from "effect";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { ReviewId } from "../schemas/review";
import { CommentService } from "../services/comment.service";
import { ReviewService } from "../services/review.service";
import { TodoService } from "../services/todo.service";

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ExportService extends ServiceMap.Service<
  ExportService,
  {
    exportReview(
      reviewId: ReviewId
    ): Effect.Effect<string, import("../schemas/review").ReviewNotFound>;
  }
>()("@ringi/ExportService") {
  static readonly Default: Layer.Layer<
    ExportService,
    never,
    ReviewService | CommentService | TodoService
  > = Layer.effect(
    ExportService,
    Effect.gen(function* () {
      const reviewSvc = yield* ReviewService;
      const commentSvc = yield* CommentService;
      const todoSvc = yield* TodoService;

      const exportReview = (reviewId: ReviewId) =>
        Effect.gen(function* () {
          const review = yield* reviewSvc.getById(reviewId);

          const repo = review.repository as {
            name?: string;
            branch?: string;
          } | null;
          const repoName = repo?.name ?? "Unknown";
          const branch = repo?.branch ?? "unknown";

          const comments = yield* commentSvc.getByReview(reviewId);
          const commentStats = yield* commentSvc.getStats(reviewId);
          const todos = yield* todoSvc.list({ reviewId });

          const lines: string[] = [];

          lines.push(`# Code Review: ${repoName}`);
          lines.push("");
          lines.push(`**Status:** ${review.status}`);
          lines.push(`**Branch:** ${branch}`);
          lines.push(`**Created:** ${review.createdAt}`);

          if (review.files && review.files.length > 0) {
            lines.push("");
            lines.push("## Files Changed");
            lines.push("");
            lines.push("| File | Status | Additions | Deletions |");
            lines.push("|------|--------|-----------|-----------|");
            for (const f of review.files) {
              const statusLabel =
                f.status === "modified"
                  ? "M"
                  : f.status === "added"
                    ? "A"
                    : f.status === "deleted"
                      ? "D"
                      : f.status;
              lines.push(
                `| ${f.filePath} | ${statusLabel} | +${f.additions} | -${f.deletions} |`
              );
            }
          }

          if (comments.length > 0) {
            lines.push("");
            lines.push(
              `## Comments (${commentStats.total} total, ${commentStats.resolved} resolved)`
            );

            const byFile = new Map<string, (typeof comments)[number][]>();
            for (const c of comments) {
              const key = c.filePath ?? "(general)";
              const arr = byFile.get(key) ?? [];
              arr.push(c);
              byFile.set(key, arr);
            }

            for (const [filePath, fileComments] of byFile) {
              lines.push("");
              lines.push(`### ${filePath}`);
              for (const c of fileComments) {
                lines.push("");
                lines.push(
                  `**Line ${c.lineNumber ?? "–"}** (${c.lineType ?? "context"})`
                );
                lines.push(`> ${c.content}`);
                if (c.suggestion) {
                  lines.push("");
                  lines.push("```suggestion");
                  lines.push(c.suggestion);
                  lines.push("```");
                }
              }
            }
          }

          if (todos.data.length > 0) {
            const completed = todos.data.filter((t: any) => t.completed).length;
            lines.push("");
            lines.push("---");
            lines.push("");
            lines.push(
              `## Todos (${todos.total} total, ${completed} completed)`
            );
            lines.push("");
            for (const t of todos.data) {
              const check = (t as any).completed ? "x" : " ";
              lines.push(`- [${check}] ${(t as any).content}`);
            }
          }

          lines.push("");
          return lines.join("\n");
        });

      return ExportService.of({ exportReview });
    })
  );
}
