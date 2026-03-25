import { useCallback, useMemo, useState } from "react";

import type { LocalComment } from "../diff/diff-file";
import { formatAnnotationFeedback } from "./format-annotation-feedback";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnnotationEntry {
  readonly id: string;
  readonly filePath: string;
  readonly lineNumber: number;
  readonly lineType: "added" | "removed" | "context";
  readonly content: string;
  readonly suggestion: string | null;
  readonly createdAt: string;
}

export interface FileAnnotationGroup {
  readonly filePath: string;
  readonly annotations: readonly AnnotationEntry[];
}

export type CopyStatus = "idle" | "copied" | "error";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseAnnotationsPanelOptions {
  /** Ref-based getter for current local comments map (avoids stale closures). */
  getLocalComments: () => ReadonlyMap<string, readonly LocalComment[]>;
  onNavigate: (filePath: string, lineNumber?: number) => void;
  onDeleteAnnotation?: (id: string) => void;
}

export const useAnnotationsPanel = ({
  getLocalComments,
  onNavigate,
  onDeleteAnnotation,
}: UseAnnotationsPanelOptions) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");

  const handleToggle = useCallback(() => setIsOpen((prev) => !prev), []);
  const handleClose = useCallback(() => setIsOpen(false), []);

  const handleAnnotationClick = useCallback(
    (entry: AnnotationEntry) => {
      onNavigate(entry.filePath, entry.lineNumber);
    },
    [onNavigate]
  );

  const handleDeleteAnnotation = useCallback(
    (id: string) => {
      onDeleteAnnotation?.(id);
    },
    [onDeleteAnnotation]
  );

  /** Snapshot the current annotations into grouped form. */
  const buildGroups = useCallback((): readonly FileAnnotationGroup[] => {
    const commentsMap = getLocalComments();
    const groups: FileAnnotationGroup[] = [];

    for (const [filePath, comments] of commentsMap) {
      if (comments.length === 0) {
        continue;
      }

      const annotations: AnnotationEntry[] = comments.map((c) => ({
        content: c.content,
        createdAt: c.createdAt,
        filePath: c.filePath,
        id: c.id,
        lineNumber: c.lineNumber,
        lineType: c.lineType,
        suggestion: c.suggestion,
      }));

      groups.push({ annotations, filePath });
    }

    // Sort groups by file path for stable order
    groups.sort((a, b) => a.filePath.localeCompare(b.filePath));
    return groups;
  }, [getLocalComments]);

  const handleCopyFeedback = useCallback(
    async (groups: readonly FileAnnotationGroup[]) => {
      const markdown = formatAnnotationFeedback(groups);
      if (!markdown) {
        return;
      }

      try {
        await navigator.clipboard.writeText(markdown);
        setCopyStatus("copied");
      } catch {
        setCopyStatus("error");
      }

      // Reset after brief display
      setTimeout(() => setCopyStatus("idle"), 1500);
    },
    []
  );

  const totalCount = useMemo(() => {
    const commentsMap = getLocalComments();
    let count = 0;
    for (const comments of commentsMap.values()) {
      count += comments.length;
    }
    return count;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: we want fresh count each render
  }, [getLocalComments]);

  return {
    buildGroups,
    copyStatus,
    handleAnnotationClick,
    handleClose,
    handleCopyFeedback,
    handleDeleteAnnotation,
    handleToggle,
    isOpen,
    totalCount,
  } as const;
};
