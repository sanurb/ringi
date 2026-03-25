import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { DiffFileMetadata, DiffStatus } from "@/api/schemas/diff";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Motion tokens
// ---------------------------------------------------------------------------

const EASE_OUT = "[transition-timing-function:cubic-bezier(0.23,1,0.32,1)]";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FileTreeProps {
  files: readonly DiffFileMetadata[];
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  reviewedFiles?: ReadonlySet<string>;
  onToggleViewed?: (filePath: string) => void;
  groupLabel?: string;
  headerAction?: ReactNode;
  emptyStateMessage?: string;
}

// ---------------------------------------------------------------------------
// Tree data structures & algorithms (unchanged)
// ---------------------------------------------------------------------------

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  file?: DiffFileMetadata;
}

const collapseTree = (node: TreeNode): void => {
  for (const child of node.children) {
    collapseTree(child);
  }

  while (
    node.children.length === 1 &&
    !node.children[0].file &&
    node.children[0].children.length > 0
  ) {
    const [onlyChild] = node.children;
    node.name = node.name ? `${node.name}/${onlyChild.name}` : onlyChild.name;
    node.path = onlyChild.path;
    node.children = onlyChild.children;
  }
};

const sortTree = (node: TreeNode): void => {
  node.children.sort((a, b) => {
    const aIsDir = !a.file;
    const bIsDir = !b.file;
    if (aIsDir !== bIsDir) {
      return aIsDir ? -1 : 1;
    }

    return a.name.localeCompare(b.name);
  });

  for (const child of node.children) {
    sortTree(child);
  }
};

const collectDirPaths = (node: TreeNode): string[] => {
  const paths: string[] = [];
  for (const child of node.children) {
    if (!child.file) {
      paths.push(child.path);
      paths.push(...collectDirPaths(child));
    }
  }

  return paths;
};

const flatFileList = (node: TreeNode): string[] => {
  const result: string[] = [];
  for (const child of node.children) {
    if (child.file) {
      result.push(child.file.newPath);
    } else {
      result.push(...flatFileList(child));
    }
  }

  return result;
};

const buildTree = (files: readonly DiffFileMetadata[]): TreeNode => {
  const root: TreeNode = { children: [], name: "", path: "" };

  for (const file of files) {
    const segments = file.newPath.split("/");
    let current = root;

    for (const [index, segment] of segments.entries()) {
      const isFile = index === segments.length - 1;
      const childPath = segments.slice(0, index + 1).join("/");

      let child = current.children.find(
        (candidate) => candidate.name === segment
      );
      if (!child) {
        child = { children: [], name: segment, path: childPath };
        if (isFile) {
          child.file = file;
        }

        current.children.push(child);
      }

      current = child;
    }
  }

  collapseTree(root);
  sortTree(root);
  return root;
};

// ---------------------------------------------------------------------------
// Status letter (inline, minimal)
// ---------------------------------------------------------------------------

const statusColor: Record<DiffStatus, string> = {
  added: "text-diff-add-text",
  deleted: "text-diff-remove-text",
  modified: "text-accent-primary",
  renamed: "text-status-info",
};

const statusLetter: Record<DiffStatus, string> = {
  added: "A",
  deleted: "D",
  modified: "M",
  renamed: "R",
};

const StatusLetter = ({ status }: { status: DiffStatus }) => (
  <span
    className={cn(
      "inline-flex w-3 shrink-0 text-center font-mono text-[10px] font-semibold leading-none",
      statusColor[status]
    )}
  >
    {statusLetter[status]}
  </span>
);

// ---------------------------------------------------------------------------
// Disclosure arrow
// ---------------------------------------------------------------------------

const DisclosureArrow = ({ expanded }: { expanded: boolean }) => (
  <span
    className={cn(
      "inline-flex h-4 w-4 shrink-0 items-center justify-center text-[10px] text-text-quaternary transition-transform duration-100",
      EASE_OUT,
      expanded && "rotate-90"
    )}
  >
    ▶
  </span>
);

// ---------------------------------------------------------------------------
// Viewed checkbox (explicit mark action)
// ---------------------------------------------------------------------------

const ViewedCheckbox = ({
  checked,
  onToggle,
  filePath,
}: {
  checked: boolean;
  onToggle?: (filePath: string) => void;
  filePath: string;
}) => {
  const handleClick = useCallback(
    (event: ReactMouseEvent) => {
      event.stopPropagation();
      onToggle?.(filePath);
    },
    [filePath, onToggle]
  );

  return (
    <label
      className={cn(
        "relative flex h-3 w-3 shrink-0 cursor-pointer items-center justify-center rounded-[3px] border transition-[border-color,background-color,color] duration-100",
        EASE_OUT,
        checked
          ? "border-status-success/50 bg-status-success/15 text-status-success"
          : "border-border-subtle text-transparent hover:border-text-quaternary"
      )}
      onClick={handleClick}
    >
      <input
        type="checkbox"
        checked={checked}
        readOnly
        className="sr-only"
        aria-label={checked ? "Unmark as viewed" : "Mark as viewed"}
        tabIndex={0}
      />
      <svg
        width="7"
        height="7"
        viewBox="0 0 7 7"
        fill="none"
        className={cn(
          "pointer-events-none transition-opacity duration-100",
          checked ? "opacity-100" : "opacity-0"
        )}
      >
        <path
          d="M1 3.5L2.75 5.25L6 1.75"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </label>
  );
};

// ---------------------------------------------------------------------------
// Tree item
// ---------------------------------------------------------------------------

interface TreeItemProps {
  node: TreeNode;
  depth: number;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  expanded: ReadonlySet<string>;
  onToggle: (path: string) => void;
  reviewedFiles?: ReadonlySet<string>;
  onToggleViewed?: (filePath: string) => void;
}

const TreeItem = ({
  node,
  depth,
  selectedFile,
  onSelectFile,
  expanded,
  onToggle,
  reviewedFiles,
  onToggleViewed,
}: TreeItemProps) => {
  const isDir = !node.file;
  const selectedPath = node.file?.newPath ?? null;
  const isExpanded = expanded.has(node.path);
  const isSelected = selectedPath === selectedFile;
  const isReviewed = selectedPath ? reviewedFiles?.has(selectedPath) : false;

  const handleToggle = useCallback(() => {
    onToggle(node.path);
  }, [node.path, onToggle]);

  const handleSelect = useCallback(() => {
    if (!selectedPath) {
      return;
    }

    onSelectFile(selectedPath);
  }, [onSelectFile, selectedPath]);

  if (isDir) {
    return (
      <>
        <button
          type="button"
          onClick={handleToggle}
          className="ringi-tree-item flex w-full items-center gap-1 px-2 py-[3px] text-left"
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
        >
          <DisclosureArrow expanded={isExpanded} />
          <span className="truncate text-[11px] text-text-tertiary">
            {node.name}
          </span>
        </button>
        {isExpanded
          ? node.children.map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedFile={selectedFile}
                onSelectFile={onSelectFile}
                expanded={expanded}
                onToggle={onToggle}
                reviewedFiles={reviewedFiles}
                onToggleViewed={onToggleViewed}
              />
            ))
          : null}
      </>
    );
  }

  const { file } = node;
  if (!file) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={handleSelect}
      className={cn(
        "ringi-tree-item ringi-file-tree-item group flex w-full items-center gap-1.5 py-[3px] pr-2 text-left transition-[background-color,border-color,opacity] duration-100",
        EASE_OUT,
        isSelected
          ? "border-l-2 border-accent-primary bg-accent-muted/50"
          : "border-l-2 border-transparent hover:bg-surface-overlay/50",
        isReviewed && !isSelected && "opacity-45"
      )}
      style={{ paddingLeft: `${depth * 14 + 8}px` }}
    >
      {onToggleViewed ? (
        <ViewedCheckbox
          checked={!!isReviewed}
          onToggle={onToggleViewed}
          filePath={file.newPath}
        />
      ) : null}
      <StatusLetter status={file.status} />
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-mono text-[11px]",
          isSelected ? "text-text-primary" : "text-text-secondary"
        )}
      >
        {node.name}
      </span>
      {/* Line counts — only show on hover or selection for less noise */}
      <span
        className={cn(
          "ml-auto flex shrink-0 gap-1 text-[10px] tabular-nums transition-opacity duration-100",
          isSelected ? "opacity-60" : "opacity-0 group-hover:opacity-50"
        )}
      >
        {file.additions > 0 ? (
          <span className="text-diff-add-text">+{file.additions}</span>
        ) : null}
        {file.deletions > 0 ? (
          <span className="text-diff-remove-text">-{file.deletions}</span>
        ) : null}
      </span>
    </button>
  );
};

// ---------------------------------------------------------------------------
// Keyboard navigation
// ---------------------------------------------------------------------------

const useFileKeyboardNav = (
  flatFiles: readonly string[],
  selectedFile: string | null,
  onSelectFile: (path: string) => void
) => {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        return;
      }

      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        if (flatFiles.length === 0) {
          return;
        }

        if (selectedFile === null) {
          onSelectFile(flatFiles[0]);
          return;
        }

        const index = flatFiles.indexOf(selectedFile);
        if (index < flatFiles.length - 1) {
          onSelectFile(flatFiles[index + 1]);
        }
        return;
      }

      if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        if (flatFiles.length === 0) {
          return;
        }

        if (selectedFile === null) {
          const lastFile = flatFiles.at(-1);
          if (lastFile) {
            onSelectFile(lastFile);
          }
          return;
        }

        const index = flatFiles.indexOf(selectedFile);
        if (index > 0) {
          onSelectFile(flatFiles[index - 1]);
        }
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [flatFiles, onSelectFile, selectedFile]);
};

// ---------------------------------------------------------------------------
// Progress strip with filter toggle
// ---------------------------------------------------------------------------

const ProgressStrip = ({
  reviewedCount,
  totalCount,
  hideViewed,
  hiddenCount,
  onToggleHideViewed,
}: {
  reviewedCount: number;
  totalCount: number;
  hideViewed: boolean;
  hiddenCount: number;
  onToggleHideViewed: () => void;
}) => {
  const pendingCount = totalCount - reviewedCount;
  const allReviewed = totalCount > 0 && reviewedCount === totalCount;
  const progressPct = totalCount > 0 ? (reviewedCount / totalCount) * 100 : 0;

  return (
    <div className="flex items-center gap-2 border-b border-border-subtle px-3 pb-2">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline gap-1 text-[10px] tabular-nums">
          <span className="font-medium text-text-secondary">
            {reviewedCount}
            <span className="text-text-quaternary">/{totalCount}</span>
          </span>
          {reviewedCount > 0 && !allReviewed ? (
            <span className="text-text-quaternary">
              · {pendingCount} pending
            </span>
          ) : null}
          {allReviewed ? (
            <span className="text-status-success">· Complete</span>
          ) : null}
        </div>
        {totalCount > 0 ? (
          <div className="h-[2px] w-full overflow-hidden rounded-full bg-border-subtle">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-300",
                EASE_OUT,
                allReviewed ? "bg-status-success/60" : "bg-accent-primary/40"
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        ) : null}
      </div>

      {reviewedCount > 0 ? (
        <button
          type="button"
          onClick={onToggleHideViewed}
          aria-pressed={hideViewed}
          title={
            hideViewed
              ? `Show all files (${hiddenCount} viewed hidden)`
              : "Show pending only"
          }
          className={cn(
            "flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium transition-[background-color,color] duration-100",
            EASE_OUT,
            hideViewed
              ? "bg-accent-muted text-accent-primary"
              : "text-text-quaternary hover:bg-surface-overlay hover:text-text-tertiary"
          )}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 12 12"
            fill="none"
            className="shrink-0"
          >
            {hideViewed ? (
              <>
                <path
                  d="M1.5 1.5L10.5 10.5"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                />
                <path
                  d="M2.4 4.8C1.8 5.4 1.5 6 1.5 6s1.5 3 4.5 3c.6 0 1.1-.1 1.6-.3M9.6 7.2C10.2 6.6 10.5 6 10.5 6s-1.5-3-4.5-3c-.6 0-1.1.1-1.6.3"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            ) : (
              <>
                <path
                  d="M1.5 6s1.5-3 4.5-3 4.5 3 4.5 3-1.5 3-4.5 3S1.5 6 1.5 6z"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle
                  cx="6"
                  cy="6"
                  r="1.5"
                  stroke="currentColor"
                  strokeWidth="1.25"
                />
              </>
            )}
          </svg>
          <span>{hideViewed ? "Filtered" : "Pending"}</span>
        </button>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// FileTree
// ---------------------------------------------------------------------------

export const FileTree = ({
  files,
  selectedFile,
  onSelectFile,
  reviewedFiles,
  onToggleViewed,
  groupLabel,
  headerAction,
  emptyStateMessage = "No files",
}: FileTreeProps) => {
  const [hideViewed, setHideViewed] = useState(false);

  const toggleHideViewed = useCallback(() => {
    setHideViewed((previous) => !previous);
  }, []);

  const reviewedCount = reviewedFiles?.size ?? 0;

  // Filter files when hiding viewed
  const visibleFiles = useMemo(() => {
    if (!hideViewed || !reviewedFiles || reviewedFiles.size === 0) {
      return files;
    }

    return files.filter((file) => !reviewedFiles.has(file.newPath));
  }, [files, hideViewed, reviewedFiles]);

  const hiddenCount = files.length - visibleFiles.length;

  const tree = useMemo(() => buildTree(visibleFiles), [visibleFiles]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(collectDirPaths(tree))
  );
  const [groupOpen, setGroupOpen] = useState(true);

  // Re-expand dirs when tree structure changes
  useEffect(() => {
    setExpanded(new Set(collectDirPaths(tree)));
  }, [tree]);

  const toggleDir = useCallback((path: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }

      return next;
    });
  }, []);

  const toggleGroupOpen = useCallback(() => {
    setGroupOpen((previous) => !previous);
  }, []);

  const flatFiles = useMemo(() => flatFileList(tree), [tree]);
  useFileKeyboardNav(flatFiles, selectedFile, onSelectFile);

  const totalAdditions = files.reduce((sum, file) => sum + file.additions, 0);
  const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0);

  const treeContent = groupLabel ? (
    <>
      <button
        type="button"
        onClick={toggleGroupOpen}
        className="ringi-tree-item flex w-full items-center gap-1 px-3 py-1.5 text-left"
      >
        <DisclosureArrow expanded={groupOpen} />
        <span className="truncate text-[11px] font-medium text-text-secondary">
          {groupLabel}
        </span>
        <span className="ml-auto text-[10px] tabular-nums text-text-tertiary">
          {visibleFiles.length}
        </span>
      </button>
      {groupOpen
        ? tree.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={0}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
              expanded={expanded}
              onToggle={toggleDir}
              reviewedFiles={reviewedFiles}
              onToggleViewed={onToggleViewed}
            />
          ))
        : null}
    </>
  ) : (
    tree.children.map((child) => (
      <TreeItem
        key={child.path}
        node={child}
        depth={0}
        selectedFile={selectedFile}
        onSelectFile={onSelectFile}
        expanded={expanded}
        onToggle={toggleDir}
        reviewedFiles={reviewedFiles}
        onToggleViewed={onToggleViewed}
      />
    ))
  );

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border-default bg-surface-secondary">
      {/* ── Header: title + source selector ──────────────────────── */}
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[11px] font-semibold text-text-primary">
            Files
          </span>
          {headerAction}
        </div>
      </div>

      {/* ── Progress strip: reviewed/pending + filter toggle ─────── */}
      <ProgressStrip
        reviewedCount={reviewedCount}
        totalCount={files.length}
        hideViewed={hideViewed}
        hiddenCount={hiddenCount}
        onToggleHideViewed={toggleHideViewed}
      />

      {/* ── File list ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-x-hidden overflow-y-auto py-0.5">
        {visibleFiles.length === 0 ? (
          <div className="flex h-32 items-center justify-center px-3 text-center text-[11px] text-text-tertiary">
            {hideViewed && hiddenCount > 0
              ? "All files reviewed"
              : emptyStateMessage}
          </div>
        ) : (
          treeContent
        )}
      </div>

      {/* ── Footer: stat totals + keyboard hint ──────────────────── */}
      <div className="flex items-center justify-between border-t border-border-subtle px-3 py-1.5">
        <span className="flex gap-1.5 text-[10px] tabular-nums text-text-quaternary">
          {totalAdditions > 0 ? (
            <span className="text-diff-add-text/70">+{totalAdditions}</span>
          ) : null}
          {totalDeletions > 0 ? (
            <span className="text-diff-remove-text/70">-{totalDeletions}</span>
          ) : null}
        </span>
        <span className="text-[10px] text-text-quaternary">
          <kbd className="rounded border border-border-subtle bg-surface-primary px-1 py-px font-mono text-[9px]">
            j
          </kbd>{" "}
          <kbd className="rounded border border-border-subtle bg-surface-primary px-1 py-px font-mono text-[9px]">
            k
          </kbd>
        </span>
      </div>
    </aside>
  );
};
