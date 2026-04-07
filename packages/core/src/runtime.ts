import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";

import { SqliteService } from "./db/database";
import { AnnotationRepo } from "./repos/annotation.repo";
import { CommentRepo } from "./repos/comment.repo";
import { CoverageRepo } from "./repos/coverage.repo";
import { ReviewFileRepo } from "./repos/review-file.repo";
import { ReviewHunkRepo } from "./repos/review-hunk.repo";
import { ReviewRepo } from "./repos/review.repo";
import { TodoRepo } from "./repos/todo.repo";
import { AnnotationService } from "./services/annotation.service";
import { CommentService } from "./services/comment.service";
import { CoverageService } from "./services/coverage.service";
import { EventService } from "./services/event.service";
import { ExportService } from "./services/export.service";
import { GhService } from "./services/gh.service";
import { GitService } from "./services/git.service";
import { ReviewService } from "./services/review.service";
import { TodoService } from "./services/todo.service";

// Repos depend on SqliteService
const RepoLive = Layer.mergeAll(
  AnnotationRepo.Default,
  ReviewRepo.Default,
  ReviewFileRepo.Default,
  ReviewHunkRepo.Default,
  CommentRepo.Default,
  CoverageRepo.Default,
  TodoRepo.Default
).pipe(Layer.provide(SqliteService.Default));

// Services depend on repos and other services
const CommentServiceLive = CommentService.Default.pipe(
  Layer.provide(CommentRepo.Default),
  Layer.provide(SqliteService.Default)
);

const TodoServiceLive = TodoService.Default.pipe(
  Layer.provide(TodoRepo.Default),
  Layer.provide(SqliteService.Default)
);

const ReviewServiceLive = ReviewService.Default.pipe(
  Layer.provide(ReviewRepo.Default),
  Layer.provide(ReviewFileRepo.Default),
  Layer.provide(ReviewHunkRepo.Default),
  Layer.provide(GitService.Default),
  Layer.provide(SqliteService.Default)
);

const CoverageServiceLive = CoverageService.Default.pipe(
  Layer.provide(CoverageRepo.Default),
  Layer.provide(ReviewHunkRepo.Default),
  Layer.provide(ReviewFileRepo.Default),
  Layer.provide(SqliteService.Default)
);

const AnnotationServiceLive = AnnotationService.Default.pipe(
  Layer.provide(AnnotationRepo.Default),
  Layer.provide(SqliteService.Default)
);

const ExportServiceLive = ExportService.Default.pipe(
  Layer.provide(ReviewServiceLive),
  Layer.provide(CommentServiceLive),
  Layer.provide(TodoServiceLive)
);

export const CoreLive = Layer.mergeAll(
  ReviewServiceLive,
  CommentServiceLive,
  CoverageServiceLive,
  AnnotationServiceLive,
  TodoServiceLive,
  GitService.Default,
  GhService.Default,
  EventService.Default,
  ExportServiceLive,
  RepoLive,
  SqliteService.Default
);

export const createCoreRuntime = () => ManagedRuntime.make(CoreLive);
