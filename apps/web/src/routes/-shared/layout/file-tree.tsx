import type { DiffFileMetadata, DiffStatus } from "@ringi/core/schemas/diff";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Tree,
  TreeExpander,
  TreeIcon,
  TreeNode,
  TreeNodeContent,
  TreeNodeTrigger,
} from "@/components/ui/tree";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Motion tokens — system-consistent with action-bar
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
  onStageFile?: (filePath: string) => void;
  groupLabel?: string;
  headerAction?: ReactNode;
  emptyStateMessage?: string;
}

// ---------------------------------------------------------------------------
// Tree data structures
// ---------------------------------------------------------------------------

interface TreeNodeData {
  name: string;
  path: string;
  children: TreeNodeData[];
  file?: DiffFileMetadata;
}

const collapseTree = (node: TreeNodeData): void => {
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

const sortTree = (node: TreeNodeData): void => {
  node.children.sort((a, b) => {
    const aIsDir = !a.file;
    const bIsDir = !b.file;
    if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const child of node.children) sortTree(child);
};

const collectDirPaths = (node: TreeNodeData): string[] => {
  const paths: string[] = [];
  for (const child of node.children) {
    if (!child.file) {
      paths.push(child.path);
      paths.push(...collectDirPaths(child));
    }
  }
  return paths;
};

const flatFileList = (node: TreeNodeData): string[] => {
  const result: string[] = [];
  for (const child of node.children) {
    if (child.file) result.push(child.file.newPath);
    else result.push(...flatFileList(child));
  }
  return result;
};

const buildTree = (files: readonly DiffFileMetadata[]): TreeNodeData => {
  const root: TreeNodeData = { children: [], name: "", path: "" };
  for (const file of files) {
    const segments = file.newPath.split("/");
    let current = root;
    for (const [index, segment] of segments.entries()) {
      const isFile = index === segments.length - 1;
      const childPath = segments.slice(0, index + 1).join("/");
      let child = current.children.find((c) => c.name === segment);
      if (!child) {
        child = { children: [], name: segment, path: childPath };
        if (isFile) child.file = file;
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
// Status indicator — single-character, color-coded
// ---------------------------------------------------------------------------

const statusColor: Record<DiffStatus, string> = {
  added: "text-diff-add-text",
  deleted: "text-diff-remove-text",
  modified: "text-accent-primary",
  moved: "text-diff-move-text",
  "moved-modified": "text-diff-move-modified-text",
  renamed: "text-status-info",
};

const statusLetter: Record<DiffStatus, string> = {
  added: "A",
  deleted: "D",
  modified: "M",
  moved: "↷",
  "moved-modified": "↷̃",
  renamed: "R",
};

// ---------------------------------------------------------------------------
// Viewed checkbox — compact, system-consistent
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
        "relative flex size-3 shrink-0 cursor-pointer items-center justify-center rounded-[3px] border transition-[border-color,background-color,color] duration-100",
        EASE_OUT,
        checked
          ? "border-status-success/50 bg-status-success/15 text-status-success"
          : "border-border-subtle text-transparent hover:border-text-tertiary/40"
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
// Context
// ---------------------------------------------------------------------------

interface FileTreeContextValue {
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  reviewedFiles?: ReadonlySet<string>;
  onToggleViewed?: (filePath: string) => void;
  onStageFile?: (filePath: string) => void;
}

const FileTreeContext = createContext<FileTreeContextValue | null>(null);

const useFileTreeContext = (): FileTreeContextValue => {
  const ctx = useContext(FileTreeContext);
  if (!ctx) throw new Error("FileItem must be rendered inside <FileTree>");
  return ctx;
};

// ---------------------------------------------------------------------------
// File row — simplified: checkbox · status · name · hover stats
//
// Key design choices:
// - No file icon — the status letter is sufficient type indication
// - Diff stats hidden by default, revealed on hover/select
// - Stage action revealed on hover only
// - Reviewed files dim to 45% — structure wins first, status is secondary
// ---------------------------------------------------------------------------

interface FileItemProps {
  node: TreeNodeData;
  depth: number;
}

const FileItem = ({ node, depth }: FileItemProps) => {
  const {
    selectedFile,
    onSelectFile,
    onToggleViewed,
    onStageFile,
    reviewedFiles,
  } = useFileTreeContext();
  const { file } = node;
  const filePath = file?.newPath ?? "";
  const isSelected = selectedFile === filePath;
  const isReviewed = reviewedFiles?.has(filePath) ?? false;

  const handleSelect = useCallback(() => {
    if (filePath) onSelectFile(filePath);
  }, [onSelectFile, filePath]);

  const handleStage = useCallback(
    (e: ReactMouseEvent) => {
      e.stopPropagation();
      onStageFile?.(filePath);
    },
    [onStageFile, filePath]
  );

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleSelect();
      }
    },
    [handleSelect]
  );

  if (!file) return null;

  return (
    <TreeNode nodeId={filePath} level={depth}>
      <div
        role="row"
        aria-current={isSelected ? "true" : undefined}
        data-selected={isSelected ? "" : undefined}
        onClick={handleSelect}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        className={cn(
          "group flex w-full cursor-pointer items-center gap-1.5 py-[3px] pr-2 text-left outline-none",
          "transition-[background-color,border-color,opacity] duration-100",
          EASE_OUT,
          isSelected
            ? "border-l-2 border-accent-primary bg-accent-muted/40"
            : "border-l-2 border-transparent hover:bg-surface-overlay/40",
          isReviewed && !isSelected && "opacity-45",
          "focus-visible:ring-1 focus-visible:ring-accent-primary/40"
        )}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        {onToggleViewed ? (
          <ViewedCheckbox
            checked={isReviewed}
            onToggle={onToggleViewed}
            filePath={filePath}
          />
        ) : null}

        {/* Status letter — always visible, color-coded */}
        <span
          className={cn(
            "inline-flex w-3 shrink-0 text-center font-mono text-[10px] font-semibold leading-none",
            statusColor[file.status]
          )}
        >
          {statusLetter[file.status]}
        </span>

        {/* File name — primary visual element */}
        <span
          className={cn(
            "min-w-0 flex-1 truncate font-mono text-[11px]",
            isSelected ? "text-text-primary" : "text-text-secondary"
          )}
        >
          {node.name}
        </span>

        {/* Hover zone: stage + diff stats */}
        <span
          className={cn(
            "ml-auto flex shrink-0 items-center gap-1 text-[10px] tabular-nums",
            "transition-opacity duration-100",
            isSelected ? "opacity-50" : "opacity-0 group-hover:opacity-50"
          )}
        >
          {onStageFile ? (
            <button
              type="button"
              onClick={handleStage}
              title={`git add ${filePath}`}
              aria-label={`Stage ${node.name}`}
              className={cn(
                "inline-flex h-4 items-center rounded px-1 font-sans text-[9px] font-medium uppercase tracking-wide text-text-tertiary",
                "transition-[color,background-color] duration-75",
                "opacity-0 group-hover:opacity-100",
                "hover:!bg-diff-add-bg hover:!text-diff-add-text",
                "active:scale-[0.95]",
                EASE_OUT
              )}
            >
              +stage
            </button>
          ) : null}
          {file.additions > 0 ? (
            <span className="text-diff-add-text/70">+{file.additions}</span>
          ) : null}
          {file.deletions > 0 ? (
            <span className="text-diff-remove-text/70">-{file.deletions}</span>
          ) : null}
        </span>
      </div>
    </TreeNode>
  );
};

// ---------------------------------------------------------------------------
// Directory row — minimal: expander + folder icon + name
// ---------------------------------------------------------------------------

const DirItem = ({ node, depth }: { node: TreeNodeData; depth: number }) => {
  const hasChildren = node.children.length > 0;
  return (
    <TreeNode nodeId={node.path} level={depth}>
      <TreeNodeTrigger
        className={cn("gap-1 py-[3px] pr-2", "hover:bg-surface-overlay/40")}
      >
        <TreeExpander hasChildren={hasChildren} />
        <TreeIcon hasChildren />
        <span className="truncate text-[11px] text-text-tertiary">
          {node.name}
        </span>
      </TreeNodeTrigger>
      {hasChildren ? (
        <TreeNodeContent>
          {node.children.map((child) =>
            child.file ? (
              <FileItem key={child.path} node={child} depth={depth + 1} />
            ) : (
              <DirItem key={child.path} node={child} depth={depth + 1} />
            )
          )}
        </TreeNodeContent>
      ) : null}
    </TreeNode>
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
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        if (flatFiles.length === 0) return;
        if (selectedFile === null) {
          onSelectFile(flatFiles[0]);
          return;
        }
        const idx = flatFiles.indexOf(selectedFile);
        if (idx < flatFiles.length - 1) onSelectFile(flatFiles[idx + 1]);
        return;
      }

      if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        if (flatFiles.length === 0) return;
        if (selectedFile === null) {
          const last = flatFiles.at(-1);
          if (last) onSelectFile(last);
          return;
        }
        const idx = flatFiles.indexOf(selectedFile);
        if (idx > 0) onSelectFile(flatFiles[idx - 1]);
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [flatFiles, onSelectFile, selectedFile]);
};

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

const renderTreeChildren = (nodes: TreeNodeData[], depth: number) =>
  nodes.map((child) =>
    child.file ? (
      <FileItem key={child.path} node={child} depth={depth} />
    ) : (
      <DirItem key={child.path} node={child} depth={depth} />
    )
  );

// ---------------------------------------------------------------------------
// FileTree (public)
// ---------------------------------------------------------------------------

export const FileTree = ({
  files,
  selectedFile,
  onSelectFile,
  reviewedFiles,
  onToggleViewed,
  onStageFile,
  groupLabel,
  headerAction,
  emptyStateMessage = "No files",
}: FileTreeProps) => {
  const [hideViewed, setHideViewed] = useState(false);
  const toggleHideViewed = useCallback(() => setHideViewed((p) => !p), []);

  const reviewedCount = reviewedFiles?.size ?? 0;

  const visibleFiles = useMemo(() => {
    if (!hideViewed || !reviewedFiles || reviewedFiles.size === 0) return files;
    return files.filter((f) => !reviewedFiles.has(f.newPath));
  }, [files, hideViewed, reviewedFiles]);

  const hiddenCount = files.length - visibleFiles.length;
  const tree = useMemo(() => buildTree(visibleFiles), [visibleFiles]);

  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(collectDirPaths(tree))
  );
  const [groupOpen, setGroupOpen] = useState(true);

  useEffect(() => {
    setExpanded(new Set(collectDirPaths(tree)));
  }, [tree]);

  const handleExpandedChange = useCallback((ids: ReadonlySet<string>) => {
    setExpanded(ids);
  }, []);

  const toggleGroupOpen = useCallback(() => setGroupOpen((p) => !p), []);

  const flatFiles = useMemo(() => flatFileList(tree), [tree]);
  useFileKeyboardNav(flatFiles, selectedFile, onSelectFile);

  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

  const reviewCtx = useMemo<FileTreeContextValue>(
    () => ({
      onSelectFile,
      onStageFile,
      onToggleViewed,
      reviewedFiles,
      selectedFile,
    }),
    [selectedFile, onSelectFile, reviewedFiles, onToggleViewed, onStageFile]
  );

  const allReviewed = files.length > 0 && reviewedCount === files.length;
  const progressPct =
    files.length > 0 ? (reviewedCount / files.length) * 100 : 0;

  const treeContent = groupLabel ? (
    <>
      <button
        type="button"
        onClick={toggleGroupOpen}
        className="ringi-tree-item flex w-full items-center gap-1 px-3 py-1.5 text-left"
      >
        <span
          className={cn(
            "inline-flex size-4 shrink-0 items-center justify-center text-[10px] text-text-tertiary/60 transition-transform duration-100",
            EASE_OUT,
            groupOpen && "rotate-90"
          )}
        >
          ▶
        </span>
        <span className="truncate text-[11px] font-medium text-text-secondary">
          {groupLabel}
        </span>
        <span className="ml-auto text-[10px] tabular-nums text-text-tertiary">
          {visibleFiles.length}
        </span>
      </button>
      {groupOpen ? renderTreeChildren(tree.children, 0) : null}
    </>
  ) : (
    renderTreeChildren(tree.children, 0)
  );

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border-default bg-surface-secondary">
      {/* ── Header: scope selector + progress ─────────────────── */}
      <div className="flex flex-col gap-1.5 px-3 py-2">
        {/* Slot for DiffScopeSelector or review title */}
        <div className="flex min-w-0 items-center gap-2">{headerAction}</div>

        {/* Inline progress bar — only when there are reviewed files */}
        {files.length > 0 ? (
          <div className="flex items-center gap-2">
            <div className="h-[2px] flex-1 overflow-hidden rounded-full bg-border-subtle">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-300",
                  EASE_OUT,
                  allReviewed ? "bg-status-success/60" : "bg-accent-primary/40"
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="shrink-0 text-[10px] tabular-nums text-text-tertiary">
              {reviewedCount}/{files.length}
            </span>

            {/* Hide-viewed toggle — only when there are reviewed files */}
            {reviewedCount > 0 ? (
              <button
                type="button"
                onClick={toggleHideViewed}
                aria-pressed={hideViewed}
                title={
                  hideViewed
                    ? `Show all (${hiddenCount} hidden)`
                    : "Hide reviewed"
                }
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded transition-[background-color,color] duration-100",
                  EASE_OUT,
                  hideViewed
                    ? "bg-accent-muted text-accent-primary"
                    : "text-text-tertiary/50 hover:bg-surface-overlay hover:text-text-tertiary"
                )}
              >
                <svg
                  width="10"
                  height="10"
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
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ── Separator ────────────────────────────────────────── */}
      <div className="h-px bg-border-subtle" />

      {/* ── File list ────────────────────────────────────────── */}
      <div className="flex-1 overflow-x-hidden overflow-y-auto py-0.5">
        {visibleFiles.length === 0 ? (
          <div className="flex h-32 items-center justify-center px-3 text-center text-[11px] text-text-tertiary">
            {hideViewed && hiddenCount > 0
              ? "All files reviewed"
              : emptyStateMessage}
          </div>
        ) : (
          <FileTreeContext.Provider value={reviewCtx}>
            <Tree
              expandedIds={expanded}
              onExpandedChange={handleExpandedChange}
              showIcons
              indent={14}
            >
              {treeContent}
            </Tree>
          </FileTreeContext.Provider>
        )}
      </div>

      {/* ── Footer: aggregate diff totals ────────────────────── */}
      {totalAdditions > 0 || totalDeletions > 0 ? (
        <div className="flex items-center border-t border-border-subtle px-3 py-1.5">
          <span className="flex gap-1.5 text-[10px] tabular-nums">
            {totalAdditions > 0 ? (
              <span className="text-diff-add-text/60">+{totalAdditions}</span>
            ) : null}
            {totalDeletions > 0 ? (
              <span className="text-diff-remove-text/60">
                -{totalDeletions}
              </span>
            ) : null}
          </span>
        </div>
      ) : null}
    </aside>
  );
};
