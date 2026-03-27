import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";

import { SqliteService } from "./db/database";
import { CommentRepo } from "./repos/comment.repo";
import { ReviewFileRepo } from "./repos/review-file.repo";
import { ReviewRepo } from "./repos/review.repo";
import { TodoRepo } from "./repos/todo.repo";
import { CommentService } from "./services/comment.service";
import { EventService } from "./services/event.service";
import { ExportService } from "./services/export.service";
import { GitService } from "./services/git.service";
import { ReviewService } from "./services/review.service";
import { TodoService } from "./services/todo.service";

// Repos depend on SqliteService
const RepoLive = Layer.mergeAll(
  ReviewRepo.Default,
  ReviewFileRepo.Default,
  CommentRepo.Default,
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
  Layer.provide(GitService.Default),
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
  TodoServiceLive,
  GitService.Default,
  EventService.Default,
  ExportServiceLive,
  RepoLive,
  SqliteService.Default
);

export const createCoreRuntime = () => ManagedRuntime.make(CoreLive);
