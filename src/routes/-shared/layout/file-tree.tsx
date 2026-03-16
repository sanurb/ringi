import { useState, useMemo, useCallback, useEffect } from "react";
import type { DiffFileMetadata, DiffStatus } from "@/api/schemas/diff";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FileTreeProps {
  files: ReadonlyArray<DiffFileMetadata>;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  reviewedFiles?: ReadonlySet<string>;
  groupLabel?: string;
}

// ---------------------------------------------------------------------------
// Tree data structure
// ---------------------------------------------------------------------------

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  file?: DiffFileMetadata;
}

// ---------------------------------------------------------------------------
// Status badge config
// ---------------------------------------------------------------------------

const statusConfig: Record<DiffStatus, { letter: string; className: string }> = {
  added: { letter: "A", className: "bg-diff-add-bg text-diff-add-text border border-diff-add-border" },
  modified: { letter: "M", className: "bg-accent-muted text-accent-primary border border-accent-primary/20" },
  deleted: { letter: "D", className: "bg-diff-remove-bg text-diff-remove-text border border-diff-remove-border" },
  renamed: { letter: "R", className: "bg-status-info/15 text-status-info border border-status-info/20" },
};

// ---------------------------------------------------------------------------
// Tree building
// ---------------------------------------------------------------------------

function buildTree(files: ReadonlyArray<DiffFileMetadata>): TreeNode {
  const root: TreeNode = { name: "", path: "", children: [] };

  for (const file of files) {
    const segments = file.newPath.split("/");
    let current = root;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isFile = i === segments.length - 1;
      const childPath = segments.slice(0, i + 1).join("/");

      let child = current.children.find((c) => c.name === segment);
      if (!child) {
        child = { name: segment, path: childPath, children: [] };
        if (isFile) child.file = file;
        current.children.push(child);
      }
      current = child;
    }
  }

  collapseTree(root);
  sortTree(root);
  return root;
}

/** Collapse single-child directory chains: a/b/c → "a/b/c" */
function collapseTree(node: TreeNode): void {
  for (const child of node.children) {
    collapseTree(child);
  }

  // Collapse: if this directory has exactly one child that is also a directory
  while (node.children.length === 1 && !node.children[0].file && node.children[0].children.length > 0) {
    const only = node.children[0];
    node.name = node.name ? `${node.name}/${only.name}` : only.name;
    node.path = only.path;
    node.children = only.children;
  }
}

/** Directories first, then files, alphabetical within each group */
function sortTree(node: TreeNode): void {
  node.children.sort((a, b) => {
    const aIsDir = !a.file;
    const bIsDir = !b.file;
    if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const child of node.children) sortTree(child);
}

/** Collect all directory paths so we can default them to expanded */
function collectDirPaths(node: TreeNode): string[] {
  const paths: string[] = [];
  for (const child of node.children) {
    if (!child.file) {
      paths.push(child.path);
      paths.push(...collectDirPaths(child));
    }
  }
  return paths;
}

/** Flatten tree into ordered file paths (tree-traversal order, files only) */
function flatFileList(node: TreeNode): string[] {
  const result: string[] = [];
  for (const child of node.children) {
    if (child.file) result.push(child.file.newPath);
    else result.push(...flatFileList(child));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: DiffStatus }) {
  const cfg = statusConfig[status];
  return (
    <span
      className={cn(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-semibold leading-none",
        cfg.className,
      )}
    >
      {cfg.letter}
    </span>
  );
}

function DisclosureArrow({ expanded }: { expanded: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center text-[10px] text-text-tertiary transition-transform",
        expanded && "rotate-90",
      )}
    >
      ▶
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tree node renderer
// ---------------------------------------------------------------------------

interface TreeItemProps {
  node: TreeNode;
  depth: number;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  expanded: ReadonlySet<string>;
  onToggle: (path: string) => void;
  reviewedFiles?: ReadonlySet<string>;
}

function TreeItem({ node, depth, selectedFile, onSelectFile, expanded, onToggle, reviewedFiles }: TreeItemProps) {
  const isDir = !node.file;
  const isExpanded = expanded.has(node.path);
  const isSelected = node.file?.newPath === selectedFile;
  const isReviewed = node.file ? reviewedFiles?.has(node.file.newPath) : false;

  if (isDir) {
    return (
      <>
        <button
          type="button"
          onClick={() => onToggle(node.path)}
          className={cn(
            "flex w-full items-center gap-1 py-1 px-2 text-left hover:bg-surface-elevated",
            "transition-colors duration-75",
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          <DisclosureArrow expanded={isExpanded} />
          <span className="truncate text-xs text-text-secondary">{node.name}</span>
        </button>
        {isExpanded &&
          node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
              expanded={expanded}
              onToggle={onToggle}
              reviewedFiles={reviewedFiles}
            />
          ))}
      </>
    );
  }

  const file = node.file;
  if (!file) return null; // unreachable: non-dir nodes always have file

  return (
    <button
      type="button"
      onClick={() => onSelectFile(file.newPath)}
      className={cn(
        "group flex w-full items-center gap-1.5 py-1 px-2 text-left transition-colors duration-75",
        isSelected
          ? "border-l-2 border-accent-primary bg-accent-muted text-text-primary"
          : "border-l-2 border-transparent hover:bg-surface-elevated",
        isReviewed && !isSelected && "opacity-50",
      )}
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
    >
      <StatusBadge status={file.status} />
      <span className="min-w-0 flex-1 truncate font-mono text-xs">{node.name}</span>
      {isReviewed && (
        <span className="shrink-0 text-[10px] text-status-success" title="Reviewed">
          ✓
        </span>
      )}
      <span className="ml-auto flex shrink-0 gap-1 text-[10px]">
        {file.additions > 0 && <span className="text-diff-add-text">+{file.additions}</span>}
        {file.deletions > 0 && <span className="text-diff-remove-text">-{file.deletions}</span>}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/** Register j/k and arrow-key navigation across the flat file list. */
function useFileKeyboardNav(
  flatFiles: ReadonlyArray<string>,
  selectedFile: string | null,
  onSelectFile: (path: string) => void,
) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        if (flatFiles.length === 0) return;
        if (selectedFile === null) {
          onSelectFile(flatFiles[0]);
          return;
        }
        const idx = flatFiles.indexOf(selectedFile);
        if (idx < flatFiles.length - 1) onSelectFile(flatFiles[idx + 1]);
        return;
      }

      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        if (flatFiles.length === 0) return;
        if (selectedFile === null) {
          onSelectFile(flatFiles[flatFiles.length - 1]);
          return;
        }
        const idx = flatFiles.indexOf(selectedFile);
        if (idx > 0) onSelectFile(flatFiles[idx - 1]);
        return;
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [flatFiles, selectedFile, onSelectFile]);
}

export function FileTree({ files, selectedFile, onSelectFile, reviewedFiles, groupLabel }: FileTreeProps) {
  const tree = useMemo(() => buildTree(files), [files]);

  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => {
    return new Set(collectDirPaths(tree));
  });

  const [groupOpen, setGroupOpen] = useState(true);

  const toggleDir = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  // j/k and arrow key navigation across files
  const flatFiles = useMemo(() => flatFileList(tree), [tree]);

  useFileKeyboardNav(flatFiles, selectedFile, onSelectFile);

  const reviewedCount = reviewedFiles?.size ?? 0;
  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border-default bg-surface-secondary">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="text-[10px] font-medium uppercase tracking-widest text-text-tertiary">Files</span>
        <span className="text-[10px] tabular-nums text-text-tertiary">
          {reviewedCount}/{files.length}
        </span>
      </div>

      {/* Tree body */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {files.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-xs text-text-tertiary">No files</div>
        ) : groupLabel ? (
          /* Collapsible group */
          <>
            <button
              type="button"
              onClick={() => setGroupOpen((o) => !o)}
              className="flex w-full items-center gap-1 px-3 py-1.5 text-left hover:bg-surface-elevated"
            >
              <DisclosureArrow expanded={groupOpen} />
              <span className="truncate text-[11px] font-medium text-text-secondary">{groupLabel}</span>
              <span className="ml-auto text-[10px] tabular-nums text-text-tertiary">{files.length}</span>
            </button>
            {groupOpen &&
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
                />
              ))}
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
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border-subtle px-3 py-2">
        <span className="flex gap-2 text-[10px] tabular-nums">
          {totalAdditions > 0 && <span className="text-diff-add-text">+{totalAdditions}</span>}
          {totalDeletions > 0 && <span className="text-diff-remove-text">-{totalDeletions}</span>}
        </span>
        <span className="text-[10px] text-text-tertiary">j/k to navigate</span>
      </div>
    </aside>
  );
}
