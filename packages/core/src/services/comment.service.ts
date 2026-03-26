import { randomUUID } from "node:crypto";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { CommentRepo } from "../repos/comment.repo";
import type {
  CommentId,
  CreateCommentInput,
  UpdateCommentInput,
} from "../schemas/comment";
import { CommentNotFound } from "../schemas/comment";
import type { ReviewId } from "../schemas/review";

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CommentService extends Effect.Service<CommentService>()(
  "@ringi/CommentService",
  {
    dependencies: [CommentRepo.Default],
    effect: Effect.sync(() => {
      // -----------------------------------------------------------------------
      // create
      // -----------------------------------------------------------------------
      const create = Effect.fn("CommentService.create")(function* create(
        reviewId: ReviewId,
        input: CreateCommentInput
      ) {
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
      const getById = Effect.fn("CommentService.getById")(function* getById(
        id: CommentId
      ) {
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
      const getByReview = Effect.fn("CommentService.getByReview")(
        function* getByReview(reviewId: ReviewId) {
          const repo = yield* CommentRepo;
          return yield* repo.findByReview(reviewId);
        }
      );

      // -----------------------------------------------------------------------
      // getByFile
      // -----------------------------------------------------------------------
      const getByFile = Effect.fn("CommentService.getByFile")(
        function* getByFile(reviewId: ReviewId, filePath: string) {
          const repo = yield* CommentRepo;
          return yield* repo.findByFile(reviewId, filePath);
        }
      );

      // -----------------------------------------------------------------------
      // update
      // -----------------------------------------------------------------------
      const update = Effect.fn("CommentService.update")(function* update(
        id: CommentId,
        input: UpdateCommentInput
      ) {
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
      const resolve = Effect.fn("CommentService.resolve")(function* resolve(
        id: CommentId
      ) {
        const repo = yield* CommentRepo;
        const comment = yield* repo.setResolved(id, true);
        if (!comment) {
          return yield* new CommentNotFound({ id });
        }
        return comment;
      });

      const unresolve = Effect.fn("CommentService.unresolve")(
        function* unresolve(id: CommentId) {
          const repo = yield* CommentRepo;
          const comment = yield* repo.setResolved(id, false);
          if (!comment) {
            return yield* new CommentNotFound({ id });
          }
          return comment;
        }
      );

      // -----------------------------------------------------------------------
      // remove
      // -----------------------------------------------------------------------
      const remove = Effect.fn("CommentService.remove")(function* remove(
        id: CommentId
      ) {
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
      const getStats = Effect.fn("CommentService.getStats")(function* getStats(
        reviewId: ReviewId
      ) {
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
