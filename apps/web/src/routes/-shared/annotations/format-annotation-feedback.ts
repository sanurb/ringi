/**
 * Converts annotation groups into the Markdown format used by
 * `formatReviewFeedback`. This is a thin adapter — it maps
 * `AnnotationEntry[]` → `ExportableComment[]` then delegates
 * to the shared formatter so the output is identical everywhere.
 */

import type { ExportableComment } from "@/lib/format-review-feedback";
import { formatReviewFeedback } from "@/lib/format-review-feedback";

import type { FileAnnotationGroup } from "./use-annotations-panel";

export const formatAnnotationFeedback = (
  groups: readonly FileAnnotationGroup[]
): string => {
  const comments: ExportableComment[] = [];

  for (const group of groups) {
    for (const entry of group.annotations) {
      comments.push({
        content: entry.content,
        filePath: entry.filePath,
        lineNumber: entry.lineNumber,
        lineType: entry.lineType === "context" ? "context" : entry.lineType,
        suggestion: entry.suggestion,
      });
    }
  }

  return formatReviewFeedback(comments);
};
