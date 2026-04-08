import { ServiceMap } from "effect";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { CoverageRepo } from "../repos/coverage.repo";
import { parseHunks, ReviewFileRepo } from "../repos/review-file.repo";
import { ReviewHunkRepo } from "../repos/review-hunk.repo";
import { type DiffHunk, type DiffLine, deriveHunkId } from "../schemas/diff";
import type { ReviewId } from "../schemas/review";
import { ReviewNotFound } from "../schemas/review";
import { AnnotationService } from "./annotation.service";
import { CommentService } from "./comment.service";
import { CoverageService } from "./coverage.service";
import { ReviewService } from "./review.service";
import { TodoService } from "./todo.service";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const ReviewContextMode = Schema.Literals([
  "review-summary",
  "file-focus",
  "feedback-prompt",
]);
export type ReviewContextMode = typeof ReviewContextMode.Type;

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

/** Raised when `file-focus` mode is used without a filePath. */
export class FilePathRequired extends Schema.TaggedErrorClass<FilePathRequired>()(
  "FilePathRequired",
  { mode: Schema.String }
) {}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Status character for compact file listings. */
const statusChar = (s: string): string =>
  s === "modified"
    ? "M"
    : s === "added"
      ? "A"
      : s === "deleted"
        ? "D"
        : s === "renamed"
          ? "R"
          : s;

/** Render a single DiffHunk as unified-diff text. */
const renderHunk = (
  hunk: DiffHunk & { readonly stableId: string }
): string[] => {
  const out: string[] = [];
  out.push(`\`\`\`diff [${hunk.stableId}]`);
  out.push(
    `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`
  );
  for (const line of hunk.lines as readonly DiffLine[]) {
    const prefix =
      line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";
    out.push(`${prefix}${line.content}`);
  }
  out.push("```");
  return out;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

type ContextBuilderDeps =
  | ReviewService
  | CommentService
  | CoverageService
  | AnnotationService
  | TodoService
  | ReviewFileRepo
  | ReviewHunkRepo
  | CoverageRepo;

export class ReviewContextBuilder extends ServiceMap.Service<
  ReviewContextBuilder,
  {
    buildContext(input: {
      readonly reviewId: ReviewId;
      readonly mode: ReviewContextMode;
      readonly filePath?: string | null;
    }): Effect.Effect<string, ReviewNotFound | FilePathRequired>;
  }
>()("@ringi/ReviewContextBuilder") {
  static readonly Default: Layer.Layer<
    ReviewContextBuilder,
    never,
    ContextBuilderDeps
  > = Layer.effect(
    ReviewContextBuilder,
    Effect.gen(function* () {
      const reviewSvc = yield* ReviewService;
      const commentSvc = yield* CommentService;
      const coverageSvc = yield* CoverageService;
      const annotationSvc = yield* AnnotationService;
      const todoSvc = yield* TodoService;
      const fileRepo = yield* ReviewFileRepo;
      const hunkRepo = yield* ReviewHunkRepo;
      const coverageRepo = yield* CoverageRepo;

      // -------------------------------------------------------------------
      // Shared data helpers
      // -------------------------------------------------------------------

      /** Set of hunk stableIds that have any coverage mark for this review. */
      const getCoveredHunkIds = (reviewId: ReviewId) =>
        Effect.gen(function* () {
          const rows = yield* coverageRepo.findByReview(reviewId);
          const covered = new Set<string>();
          for (const row of rows) {
            covered.add(row.hunk_stable_id);
          }
          return covered;
        });

      /** All persisted hunks for a review, grouped by filePath. */
      const getHunksByFile = (
        files: readonly { id: string; filePath: string }[]
      ) =>
        Effect.gen(function* () {
          const byFile = new Map<
            string,
            { stableId: string; filePath: string }[]
          >();
          for (const file of files) {
            const hunks = yield* hunkRepo.findByReviewFile(file.id);
            byFile.set(
              file.filePath,
              hunks.map((h) => ({
                filePath: file.filePath,
                stableId: h.stableId,
              }))
            );
          }
          return byFile;
        });

      // -------------------------------------------------------------------
      // review-summary
      // -------------------------------------------------------------------

      const buildReviewSummary = (reviewId: ReviewId) =>
        Effect.gen(function* () {
          const review = yield* reviewSvc.getById(reviewId);
          const comments = yield* commentSvc.getByReview(reviewId);
          const coverage = yield* coverageSvc.getSummary(reviewId);
          const annotations = yield* annotationSvc.findByReview(reviewId);
          const annotationStats = yield* annotationSvc.stats(reviewId);
          const todos = yield* todoSvc.list({ reviewId });

          const repo = review.repository as {
            name?: string;
            branch?: string;
          } | null;
          const repoName = repo?.name ?? "unknown";
          const branch = repo?.branch ?? "unknown";

          // Coverage per file
          const coveredIds = yield* getCoveredHunkIds(reviewId);
          const reviewFiles = (
            review.files as readonly {
              id: string;
              filePath: string;
              oldPath: string | null;
              status: string;
              additions: number;
              deletions: number;
            }[]
          ).map((f) => ({ id: f.id, filePath: f.filePath }));
          const hunksByFile = yield* getHunksByFile(reviewFiles);

          // Comment / annotation counts per file
          const commentsByFile = new Map<string, number>();
          for (const c of comments as readonly { filePath: string }[]) {
            commentsByFile.set(
              c.filePath,
              (commentsByFile.get(c.filePath) ?? 0) + 1
            );
          }
          const annotationsByFile = new Map<string, number>();
          for (const a of annotations) {
            annotationsByFile.set(
              a.filePath,
              (annotationsByFile.get(a.filePath) ?? 0) + 1
            );
          }

          const lines: string[] = [];

          // --- Header ---
          lines.push(`## Review: ${repoName}:${branch} (${review.sourceType})`);
          lines.push(
            `Status: ${review.status} | Files: ${review.files.length} | Coverage: ${coverage.reviewedHunks}/${coverage.totalHunks} hunks`
          );
          lines.push("");

          // --- Files Changed ---
          lines.push("### Files Changed");
          for (const f of review.files as readonly {
            filePath: string;
            status: string;
            additions: number;
            deletions: number;
          }[]) {
            const fileHunks = hunksByFile.get(f.filePath) ?? [];
            const reviewed = fileHunks.filter((h) =>
              coveredIds.has(h.stableId)
            ).length;
            const fileCov =
              fileHunks.length > 0
                ? `${reviewed}/${fileHunks.length} hunks`
                : "–";
            lines.push(
              `- ${f.filePath} [${statusChar(f.status)}] +${f.additions} -${f.deletions} | comments: ${commentsByFile.get(f.filePath) ?? 0} | annotations: ${annotationsByFile.get(f.filePath) ?? 0} | coverage: ${fileCov}`
            );
          }
          lines.push("");

          // --- Unresolved Comments ---
          const unresolved = (
            comments as readonly {
              filePath: string;
              lineNumber: number | null;
              lineType: string | null;
              content: string;
              suggestion: string | null;
              resolved: boolean;
            }[]
          ).filter((c) => !c.resolved);
          lines.push(`### Unresolved Comments (${unresolved.length})`);
          for (const c of unresolved) {
            const loc = c.lineNumber != null ? `:${c.lineNumber}` : "";
            const side = c.lineType ? ` [${c.lineType}]` : "";
            lines.push(`- ${c.filePath}${loc}${side} — ${c.content}`);
            if (c.suggestion) {
              lines.push("  ```suggestion");
              lines.push(`  ${c.suggestion}`);
              lines.push("  ```");
            }
          }
          lines.push("");

          // --- External Annotations ---
          const sourceCount = Object.keys(annotationStats.bySource).length;
          lines.push(
            `### External Annotations (${annotations.length} from ${sourceCount} sources)`
          );
          for (const a of annotations) {
            const sev = a.severity ? `[${a.severity}] ` : "";
            lines.push(
              `- ${sev}${a.filePath}:${a.lineStart} — ${a.content} (source: ${a.source})`
            );
          }
          lines.push("");

          // --- Pending Todos ---
          const pending = (
            todos.data as readonly { content: string; completed: boolean }[]
          ).filter((t) => !t.completed);
          lines.push(`### Pending Todos (${pending.length})`);
          for (const t of pending) {
            lines.push(`- ${t.content}`);
          }
          lines.push("");

          // --- Uncovered Hunks ---
          const allHunks = [...hunksByFile.values()].flat();
          const uncovered = allHunks.filter((h) => !coveredIds.has(h.stableId));
          lines.push(`### Uncovered Hunks (${uncovered.length})`);
          for (const h of uncovered) {
            lines.push(`- ${h.stableId}`);
          }

          return lines.join("\n");
        });

      // -------------------------------------------------------------------
      // file-focus
      // -------------------------------------------------------------------

      const buildFileFocus = (reviewId: ReviewId, filePath: string) =>
        Effect.gen(function* () {
          const review = yield* reviewSvc.getById(reviewId);
          const file = (
            review.files as readonly {
              id: string;
              filePath: string;
              status: string;
              additions: number;
              deletions: number;
            }[]
          ).find((f) => f.filePath === filePath);

          // Persisted hunks — read from DB, no live-git reconstruction.
          let hunksWithId: (DiffHunk & { readonly stableId: string })[] = [];

          if (file) {
            const storedHunks = yield* hunkRepo.findByReviewFile(file.id);
            if (storedHunks.length > 0) {
              const fileRow = yield* fileRepo.findByReviewAndPath(
                reviewId,
                filePath
              );
              const parsed = yield* parseHunks(fileRow?.hunks_data ?? null);
              const stableIdByIndex = new Map(
                storedHunks.map((h) => [h.hunkIndex, h.stableId])
              );
              hunksWithId = parsed.map((h, idx) => ({
                ...h,
                stableId: stableIdByIndex.get(idx) ?? `${filePath}:hunk-${idx}`,
              }));
            } else {
              // Try hunks_data fallback (pre-v7 reviews without review_hunks rows)
              const fileRow = yield* fileRepo.findByReviewAndPath(
                reviewId,
                filePath
              );
              if (fileRow?.hunks_data) {
                const parsed = yield* parseHunks(fileRow.hunks_data);
                hunksWithId = parsed.map((h) => ({
                  ...h,
                  stableId: deriveHunkId(
                    filePath,
                    h.oldStart,
                    h.oldLines,
                    h.newStart,
                    h.newLines
                  ),
                }));
              }
            }
          }

          const comments = yield* commentSvc.getByFile(reviewId, filePath);
          const annotations = yield* annotationSvc.findByFile(
            reviewId,
            filePath
          );

          // Per-file coverage
          const coveredIds = yield* getCoveredHunkIds(reviewId);
          const reviewedCount = hunksWithId.filter((h) =>
            coveredIds.has(h.stableId)
          ).length;

          const status = file?.status ?? "unknown";
          const additions = file?.additions ?? 0;
          const deletions = file?.deletions ?? 0;

          const lines: string[] = [];

          // --- Header ---
          lines.push(`## Reviewing: ${filePath} (${status})`);
          lines.push(
            `Additions: ${additions} | Deletions: ${deletions} | Coverage: ${reviewedCount}/${hunksWithId.length} hunks`
          );
          lines.push("");

          // --- Diff ---
          lines.push("### Diff");
          if (hunksWithId.length === 0) {
            lines.push("_No persisted hunks available for this file._");
          }
          for (const hunk of hunksWithId) {
            lines.push(...renderHunk(hunk));
          }
          lines.push("");

          // --- Comments ---
          lines.push(
            `### Comments on this file (${(comments as readonly unknown[]).length})`
          );
          for (const c of comments as readonly {
            lineNumber: number | null;
            lineType: string | null;
            resolved: boolean;
            content: string;
            suggestion: string | null;
          }[]) {
            const loc =
              c.lineNumber != null ? `line ${c.lineNumber}` : "general";
            const side = c.lineType ? ` [${c.lineType}]` : "";
            const resolved = c.resolved ? " (resolved)" : "";
            lines.push(`- ${loc}${side}${resolved}: ${c.content}`);
            if (c.suggestion) {
              lines.push("  ```suggestion");
              lines.push(`  ${c.suggestion}`);
              lines.push("  ```");
            }
          }
          lines.push("");

          // --- Annotations ---
          lines.push(`### Annotations on this file (${annotations.length})`);
          for (const a of annotations) {
            const sev = a.severity ? `[${a.severity}] ` : "";
            lines.push(
              `- ${sev}line ${a.lineStart}-${a.lineEnd}: ${a.content} (source: ${a.source})`
            );
          }

          return lines.join("\n");
        });

      // -------------------------------------------------------------------
      // feedback-prompt
      // -------------------------------------------------------------------

      const buildFeedbackPrompt = (reviewId: ReviewId) =>
        Effect.gen(function* () {
          const review = yield* reviewSvc.getById(reviewId);
          const comments = yield* commentSvc.getByReview(reviewId);
          const todos = yield* todoSvc.list({ reviewId });

          const repo = review.repository as {
            name?: string;
            branch?: string;
          } | null;
          const repoName = repo?.name ?? "unknown";
          const branch = repo?.branch ?? "unknown";

          const unresolved = (
            comments as readonly {
              filePath: string;
              lineNumber: number | null;
              lineType: string | null;
              content: string;
              suggestion: string | null;
              resolved: boolean;
            }[]
          ).filter((c) => !c.resolved);
          const pending = (
            todos.data as readonly { content: string; completed: boolean }[]
          ).filter((t) => !t.completed);

          const lines: string[] = [];

          lines.push(
            `Please address the following review feedback for ${repoName}:${branch}:`
          );
          lines.push("");
          lines.push(`Review decision: ${review.status}`);
          lines.push("");

          for (let i = 0; i < unresolved.length; i++) {
            const c = unresolved[i]!;
            const loc =
              c.lineNumber != null
                ? `${c.filePath}:${c.lineNumber}`
                : c.filePath;
            const side = c.lineType ? ` [${c.lineType}]` : "";
            lines.push(`${i + 1}. ${loc}${side} — ${c.content}`);
            if (c.suggestion) {
              lines.push(`   Suggestion: ${c.suggestion}`);
            }
          }

          if (unresolved.length > 0 && pending.length > 0) {
            lines.push("");
          }

          for (let i = 0; i < pending.length; i++) {
            lines.push(
              `${unresolved.length + i + 1}. TODO: ${pending[i]!.content}`
            );
          }

          return lines.join("\n");
        });

      // -------------------------------------------------------------------
      // Dispatcher
      // -------------------------------------------------------------------

      const buildContext = (input: {
        readonly reviewId: ReviewId;
        readonly mode: ReviewContextMode;
        readonly filePath?: string | null;
      }) =>
        Effect.gen(function* () {
          const { reviewId, mode, filePath } = input;

          if (mode === "file-focus" && !filePath) {
            return yield* new FilePathRequired({ mode });
          }

          switch (mode) {
            case "review-summary":
              return yield* buildReviewSummary(reviewId);
            case "file-focus":
              return yield* buildFileFocus(reviewId, filePath!);
            case "feedback-prompt":
              return yield* buildFeedbackPrompt(reviewId);
          }
        });

      return ReviewContextBuilder.of({ buildContext });
    })
  );
}
