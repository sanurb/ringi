import { randomUUID } from "node:crypto";

import { ServiceMap } from "effect";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
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

export class CommentService extends ServiceMap.Service<
  CommentService,
  {
    create(reviewId: ReviewId, input: CreateCommentInput): Effect.Effect<any>;
    getById(id: CommentId): Effect.Effect<any, CommentNotFound>;
    getByReview(reviewId: ReviewId): Effect.Effect<any>;
    getByFile(reviewId: ReviewId, filePath: string): Effect.Effect<any>;
    update(
      id: CommentId,
      input: UpdateCommentInput
    ): Effect.Effect<any, CommentNotFound>;
    resolve(id: CommentId): Effect.Effect<any, CommentNotFound>;
    unresolve(id: CommentId): Effect.Effect<any, CommentNotFound>;
    remove(id: CommentId): Effect.Effect<{ success: true }, CommentNotFound>;
    getStats(reviewId: ReviewId): Effect.Effect<any>;
  }
>()("@ringi/CommentService") {
  static readonly Default: Layer.Layer<CommentService, never, CommentRepo> =
    Layer.effect(
      CommentService,
      Effect.gen(function* () {
        // Capture the repo at layer-creation time
        const repo = yield* CommentRepo;

        const create = (reviewId: ReviewId, input: CreateCommentInput) => {
          const id = randomUUID() as CommentId;
          return repo.create({
            content: input.content,
            filePath: input.filePath,
            id,
            lineNumber: input.lineNumber ?? null,
            lineType: input.lineType ?? null,
            reviewId,
            suggestion: input.suggestion ?? null,
          });
        };

        const getById = (id: CommentId) =>
          Effect.gen(function* () {
            const comment = yield* repo.findById(id);
            if (!comment) {
              return yield* new CommentNotFound({ id });
            }
            return comment;
          });

        const getByReview = (reviewId: ReviewId) => repo.findByReview(reviewId);

        const getByFile = (reviewId: ReviewId, filePath: string) =>
          repo.findByFile(reviewId, filePath);

        const update = (id: CommentId, input: UpdateCommentInput) =>
          Effect.gen(function* () {
            const updates: { content?: string; suggestion?: string | null } =
              {};
            if (input.content && Option.isSome(input.content)) {
              updates.content = input.content.value;
            }
            if (input.suggestion && Option.isSome(input.suggestion)) {
              updates.suggestion = input.suggestion.value;
            }

            const comment = yield* repo.update(id, updates);
            if (!comment) {
              return yield* new CommentNotFound({ id });
            }
            return comment;
          });

        const resolve = (id: CommentId) =>
          Effect.gen(function* () {
            const comment = yield* repo.setResolved(id, true);
            if (!comment) {
              return yield* new CommentNotFound({ id });
            }
            return comment;
          });

        const unresolve = (id: CommentId) =>
          Effect.gen(function* () {
            const comment = yield* repo.setResolved(id, false);
            if (!comment) {
              return yield* new CommentNotFound({ id });
            }
            return comment;
          });

        const remove = (id: CommentId) =>
          Effect.gen(function* () {
            const existed = yield* repo.remove(id);
            if (!existed) {
              return yield* new CommentNotFound({ id });
            }
            return { success: true as const };
          });

        const getStats = (reviewId: ReviewId) => repo.countByReview(reviewId);

        return CommentService.of({
          create,
          getByFile,
          getById,
          getByReview,
          getStats,
          remove,
          resolve,
          unresolve,
          update,
        });
      })
    );
}
