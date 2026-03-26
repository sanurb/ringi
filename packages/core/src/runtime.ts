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

export const CoreLive = Layer.mergeAll(
  ReviewService.Default,
  ReviewRepo.Default,
  ReviewFileRepo.Default,
  CommentService.Default,
  CommentRepo.Default,
  TodoService.Default,
  TodoRepo.Default,
  GitService.Default,
  EventService.Default,
  ExportService.Default,
  SqliteService.Default
);

export const createCoreRuntime = () => ManagedRuntime.make(CoreLive);
