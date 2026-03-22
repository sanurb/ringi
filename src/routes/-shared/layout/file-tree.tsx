import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import type { DiffFileMetadata, DiffStatus } from "@/api/schemas/diff";
import { cn } from "@/lib/utils";

interface FileTreeProps {
  files: readonly DiffFileMetadata[];
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  reviewedFiles?: ReadonlySet<string>;
  groupLabel?: string;
  headerAction?: ReactNode;
  emptyStateMessage?: string;
}

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  file?: DiffFileMetadata;
}

const statusConfig: Record<DiffStatus, { letter: string; className: string }> =
  {
    added: {
      className:
        "border border-diff-add-border bg-diff-add-bg text-diff-add-text",
      letter: "A",
    },
    deleted: {
      className:
        "border border-diff-remove-border bg-diff-remove-bg text-diff-remove-text",
      letter: "D",
    },
    modified: {
      className:
        "border border-accent-primary/20 bg-accent-muted text-accent-primary",
      letter: "M",
    },
    renamed: {
      className:
        "border border-status-info/20 bg-status-info/15 text-status-info",
      letter: "R",
    },
  };

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

const StatusBadge = ({ status }: { status: DiffStatus }) => {
  const cfg = statusConfig[status];
  return (
    <span
      className={cn(
        "ringi-status-badge inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-semibold leading-none",
        cfg.className
      )}
    >
      {cfg.letter}
    </span>
  );
};

const DisclosureArrow = ({ expanded }: { expanded: boolean }) => (
  <span
    className={cn(
      "ringi-disclosure-arrow inline-flex h-4 w-4 shrink-0 items-center justify-center text-[10px] text-text-tertiary",
      expanded && "rotate-90"
    )}
  >
    ▶
  </span>
);

interface TreeItemProps {
  node: TreeNode;
  depth: number;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  expanded: ReadonlySet<string>;
  onToggle: (path: string) => void;
  reviewedFiles?: ReadonlySet<string>;
}

const TreeItem = ({
  node,
  depth,
  selectedFile,
  onSelectFile,
  expanded,
  onToggle,
  reviewedFiles,
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
          className="ringi-tree-item flex w-full items-center gap-1 px-2 py-1 text-left"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          <DisclosureArrow expanded={isExpanded} />
          <span className="truncate text-xs text-text-secondary">
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
        "ringi-tree-item ringi-file-tree-item group flex w-full items-center gap-1.5 px-2 py-1 text-left",
        isSelected
          ? "border-l-2 border-accent-primary bg-accent-muted text-text-primary"
          : "border-l-2 border-transparent text-text-secondary",
        isReviewed && !isSelected && "opacity-50"
      )}
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
    >
      <StatusBadge status={file.status} />
      <span className="min-w-0 flex-1 truncate font-mono text-xs">
        {node.name}
      </span>
      {isReviewed ? (
        <span
          className="ringi-status-badge shrink-0 text-[10px] text-status-success"
          title="Reviewed"
        >
          ✓
        </span>
      ) : null}
      <span className="ml-auto flex shrink-0 gap-1 text-[10px]">
        {file.additions > 0 ? (
          <span className="ringi-status-badge text-diff-add-text">
            +{file.additions}
          </span>
        ) : null}
        {file.deletions > 0 ? (
          <span className="ringi-status-badge text-diff-remove-text">
            -{file.deletions}
          </span>
        ) : null}
      </span>
    </button>
  );
};

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

export const FileTree = ({
  files,
  selectedFile,
  onSelectFile,
  reviewedFiles,
  groupLabel,
  headerAction,
  emptyStateMessage = "No files",
}: FileTreeProps) => {
  const tree = useMemo(() => buildTree(files), [files]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(collectDirPaths(tree))
  );
  const [groupOpen, setGroupOpen] = useState(true);

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

  const reviewedCount = reviewedFiles?.size ?? 0;
  const totalAdditions = files.reduce((sum, file) => sum + file.additions, 0);
  const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0);
  const headerCount = headerAction ? null : `${reviewedCount}/${files.length}`;

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
          {files.length}
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
      />
    ))
  );

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border-default bg-surface-secondary">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-widest text-text-tertiary">
            Files
          </span>
          {headerAction}
        </div>
        {headerCount ? (
          <span className="shrink-0 text-[10px] tabular-nums text-text-tertiary">
            {headerCount}
          </span>
        ) : null}
      </div>

      <div className="flex-1 overflow-x-hidden overflow-y-auto">
        {files.length === 0 ? (
          <div className="flex h-32 items-center justify-center px-3 text-center text-xs text-text-tertiary">
            {emptyStateMessage}
          </div>
        ) : (
          treeContent
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border-subtle px-3 py-2">
        <span className="flex gap-2 text-[10px] tabular-nums">
          {totalAdditions > 0 ? (
            <span className="text-diff-add-text">+{totalAdditions}</span>
          ) : null}
          {totalDeletions > 0 ? (
            <span className="text-diff-remove-text">-{totalDeletions}</span>
          ) : null}
        </span>
        <span className="text-[10px] text-text-tertiary">j/k to navigate</span>
      </div>
    </aside>
  );
};
