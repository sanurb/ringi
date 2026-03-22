import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";

import { SqliteService } from "@/core/db/database";
import { CommentRepo } from "@/core/repos/comment.repo";
import { ReviewFileRepo } from "@/core/repos/review-file.repo";
import { ReviewRepo } from "@/core/repos/review.repo";
import { TodoRepo } from "@/core/repos/todo.repo";
import { CommentService } from "@/core/services/comment.service";
import { EventService } from "@/core/services/event.service";
import { ExportService } from "@/core/services/export.service";
import { GitService } from "@/core/services/git.service";
import { ReviewService } from "@/core/services/review.service";
import { TodoService } from "@/core/services/todo.service";

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
