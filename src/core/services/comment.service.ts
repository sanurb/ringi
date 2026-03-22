import { randomUUID } from "node:crypto";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type {
  CommentId,
  CreateCommentInput,
  UpdateCommentInput,
} from "@/api/schemas/comment";
import { CommentNotFound } from "@/api/schemas/comment";
import type { ReviewId } from "@/api/schemas/review";
import { CommentRepo } from "@/core/repos/comment.repo";

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CommentService extends Effect.Service<CommentService>()(
  "CommentService",
  {
    dependencies: [CommentRepo.Default],
    effect: Effect.sync(() => {
      // -----------------------------------------------------------------------
      // create
      // -----------------------------------------------------------------------
      const create = (reviewId: ReviewId, input: CreateCommentInput) =>
        Effect.gen(function*  create() {
          const repo = yield* CommentRepo;
          const id = randomUUID() as CommentId;

          return yield* repo.create({
            content: input.content,
            filePath: input.filePath,
            id,
            lineNumber: input.lineNumber,
            lineType: input.lineType,
            reviewId,
            suggestion: input.suggestion,
          });
        });

      // -----------------------------------------------------------------------
      // getById
      // -----------------------------------------------------------------------
      const getById = (id: CommentId) =>
        Effect.gen(function*  getById() {
          const repo = yield* CommentRepo;
          const comment = yield* repo.findById(id);
          if (!comment) {
            return yield* new CommentNotFound({ id });
          }
          return comment;
        });

      // -----------------------------------------------------------------------
      // getByReview
      // -----------------------------------------------------------------------
      const getByReview = (reviewId: ReviewId) =>
        Effect.gen(function*  getByReview() {
          const repo = yield* CommentRepo;
          return yield* repo.findByReview(reviewId);
        });

      // -----------------------------------------------------------------------
      // getByFile
      // -----------------------------------------------------------------------
      const getByFile = (reviewId: ReviewId, filePath: string) =>
        Effect.gen(function*  getByFile() {
          const repo = yield* CommentRepo;
          return yield* repo.findByFile(reviewId, filePath);
        });

      // -----------------------------------------------------------------------
      // update
      // -----------------------------------------------------------------------
      const update = (id: CommentId, input: UpdateCommentInput) =>
        Effect.gen(function*  update() {
          const repo = yield* CommentRepo;

          const updates: { content?: string; suggestion?: string | null } = {};
          if (Option.isSome(input.content)) {
            updates.content = input.content.value;
          }
          if (Option.isSome(input.suggestion)) {
            updates.suggestion = input.suggestion.value;
          }

          const comment = yield* repo.update(id, updates);
          if (!comment) {
            return yield* new CommentNotFound({ id });
          }
          return comment;
        });

      // -----------------------------------------------------------------------
      // resolve / unresolve
      // -----------------------------------------------------------------------
      const resolve = (id: CommentId) =>
        Effect.gen(function*  resolve() {
          const repo = yield* CommentRepo;
          const comment = yield* repo.setResolved(id, true);
          if (!comment) {
            return yield* new CommentNotFound({ id });
          }
          return comment;
        });

      const unresolve = (id: CommentId) =>
        Effect.gen(function*  unresolve() {
          const repo = yield* CommentRepo;
          const comment = yield* repo.setResolved(id, false);
          if (!comment) {
            return yield* new CommentNotFound({ id });
          }
          return comment;
        });

      // -----------------------------------------------------------------------
      // remove
      // -----------------------------------------------------------------------
      const remove = (id: CommentId) =>
        Effect.gen(function*  remove() {
          const repo = yield* CommentRepo;
          const existed = yield* repo.remove(id);
          if (!existed) {
            return yield* new CommentNotFound({ id });
          }
          return { success: true as const };
        });

      // -----------------------------------------------------------------------
      // getStats
      // -----------------------------------------------------------------------
      const getStats = (reviewId: ReviewId) =>
        Effect.gen(function*  getStats() {
          const repo = yield* CommentRepo;
          return yield* repo.countByReview(reviewId);
        });

      // -----------------------------------------------------------------------
      // Public interface
      // -----------------------------------------------------------------------
      return {
        create,
        getByFile,
        getById,
        getByReview,
        getStats,
        remove,
        resolve,
        unresolve,
        update,
      } as const;
    }),
  }
) {}
