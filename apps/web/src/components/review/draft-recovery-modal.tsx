"use client";

import { useCallback } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatRelativeTime } from "@/lib/session-draft";
import type { SessionDraft } from "@/lib/session-draft";
import { cn } from "@/lib/utils";

const buttonMotionClass =
  "transition-[transform,background-color,color,border-color,box-shadow,opacity] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] motion-reduce:transform-none";

export interface DraftRecoveryModalProps {
  open: boolean;
  draft: SessionDraft;
  onRestore: () => void;
  onDismiss: () => void;
}

export const DraftRecoveryModal = ({
  open,
  draft,
  onRestore,
  onDismiss,
}: DraftRecoveryModalProps) => {
  const fileCount = draft.viewedFiles.length;
  const timeLabel = formatRelativeTime(draft.savedAt);

  const handleRestore = useCallback(() => {
    onRestore();
  }, [onRestore]);

  const handleDismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  const handleOpenChange = useCallback(
    (v: boolean) => {
      if (!v) {
        onDismiss();
      }
    },
    [onDismiss]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm gap-0" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Draft Recovered</DialogTitle>
          <DialogDescription>
            {`Found ${fileCount} viewed file${fileCount === 1 ? "" : "s"} from ${timeLabel}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-3">
          <ul className="flex flex-col gap-1">
            {draft.viewedFiles.slice(0, 5).map((filePath) => (
              <li
                key={filePath}
                className="truncate font-mono text-xs text-text-secondary"
              >
                {filePath}
              </li>
            ))}
            {fileCount > 5 ? (
              <li className="text-xs text-text-tertiary">
                {`… and ${fileCount - 5} more`}
              </li>
            ) : null}
          </ul>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={handleDismiss}
            className={cn(
              "rounded-lg border border-border-default bg-surface-elevated px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 active:scale-[0.97]",
              buttonMotionClass
            )}
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={handleRestore}
            className={cn(
              "rounded-lg bg-accent-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40 active:scale-[0.97]",
              buttonMotionClass
            )}
          >
            Restore
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
