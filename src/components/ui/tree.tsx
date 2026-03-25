"use client";

import { ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
} from "react";
import type {
  ComponentPropsWithoutRef,
  HTMLAttributes,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from "react";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Stable default references (avoid new-reference-per-render)
// ---------------------------------------------------------------------------

const EMPTY_IDS: string[] = [];

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface TreeContextValue {
  expandedIds: ReadonlySet<string>;
  selectedIds: readonly string[];
  toggleExpanded: (nodeId: string) => void;
  handleSelection: (nodeId: string, ctrlKey: boolean) => void;
  showIcons: boolean;
  indent: number;
}

const TreeContext = createContext<TreeContextValue | undefined>(undefined);

const useTree = () => {
  const ctx = useContext(TreeContext);
  if (!ctx) {
    throw new Error("Tree components must be used within <Tree>");
  }
  return ctx;
};

interface NodeContextValue {
  nodeId: string;
  level: number;
}

const NodeContext = createContext<NodeContextValue | undefined>(undefined);

const useNode = () => {
  const ctx = useContext(NodeContext);
  if (!ctx) {
    throw new Error("TreeNode components must be used within <TreeNode>");
  }
  return ctx;
};

// ---------------------------------------------------------------------------
// <Tree> — root provider
// ---------------------------------------------------------------------------

export interface TreeProps {
  children: ReactNode;
  /** IDs expanded on mount. */
  defaultExpandedIds?: string[];
  /** Controlled expanded set — when provided, `onExpandedChange` is required. */
  expandedIds?: ReadonlySet<string>;
  onExpandedChange?: (ids: ReadonlySet<string>) => void;
  /** Controlled selection. */
  selectedIds?: readonly string[];
  onSelectionChange?: (ids: string[]) => void;
  showIcons?: boolean;
  indent?: number;
  className?: string;
}

export const Tree = ({
  children,
  defaultExpandedIds = EMPTY_IDS,
  expandedIds: controlledExpanded,
  onExpandedChange,
  selectedIds: controlledSelected,
  onSelectionChange,
  showIcons = true,
  indent = 14,
  className,
}: TreeProps) => {
  // --- expanded state ---
  const [internalExpanded, setInternalExpanded] = useState<ReadonlySet<string>>(
    () => new Set(defaultExpandedIds)
  );
  const isExpandedControlled =
    controlledExpanded !== undefined && onExpandedChange !== undefined;
  const expandedIds = isExpandedControlled
    ? controlledExpanded
    : internalExpanded;

  const toggleExpanded = useCallback(
    (id: string) => {
      const next = new Set(expandedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      if (isExpandedControlled && onExpandedChange) {
        onExpandedChange(next);
      } else {
        setInternalExpanded(next);
      }
    },
    [expandedIds, isExpandedControlled, onExpandedChange]
  );

  // --- selection state ---
  const [internalSelected, setInternalSelected] = useState<string[]>([]);
  const isSelControlled =
    controlledSelected !== undefined && onSelectionChange !== undefined;
  const selectedIds = isSelControlled ? controlledSelected : internalSelected;

  const handleSelection = useCallback(
    (id: string, _ctrlKey: boolean) => {
      const next = selectedIds.includes(id) ? [] : [id];
      if (isSelControlled && onSelectionChange) {
        onSelectionChange(next);
      } else {
        setInternalSelected(next);
      }
    },
    [selectedIds, isSelControlled, onSelectionChange]
  );

  const ctx = useMemo(
    () => ({
      expandedIds,
      handleSelection,
      indent,
      selectedIds,
      showIcons,
      toggleExpanded,
    }),
    [
      expandedIds,
      selectedIds,
      toggleExpanded,
      handleSelection,
      showIcons,
      indent,
    ]
  );

  return (
    <TreeContext.Provider value={ctx}>
      <div className={cn("w-full", className)} role="tree">
        {children}
      </div>
    </TreeContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// <TreeNode> — provides node-level context
// ---------------------------------------------------------------------------

export type TreeNodeProps = HTMLAttributes<HTMLDivElement> & {
  nodeId?: string;
  level?: number;
};

export const TreeNode = ({
  nodeId: providedId,
  level = 0,
  children,
  className,
  ...props
}: TreeNodeProps) => {
  const generatedId = useId();
  const nodeId = providedId ?? generatedId;

  const ctx = useMemo(() => ({ level, nodeId }), [nodeId, level]);

  return (
    <NodeContext.Provider value={ctx}>
      <div className={cn("select-none", className)} role="treeitem" {...props}>
        {children}
      </div>
    </NodeContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// <TreeNodeTrigger> — clickable row
// ---------------------------------------------------------------------------

export type TreeNodeTriggerProps = HTMLAttributes<HTMLButtonElement>;

export const TreeNodeTrigger = ({
  children,
  className,
  onClick,
  ...props
}: TreeNodeTriggerProps) => {
  const { selectedIds, toggleExpanded, handleSelection, indent } = useTree();
  const { nodeId, level } = useNode();
  const isSelected = selectedIds.includes(nodeId);

  const handleClick = useCallback(
    (e: ReactMouseEvent<HTMLButtonElement>) => {
      toggleExpanded(nodeId);
      handleSelection(nodeId, e.ctrlKey || e.metaKey);
      onClick?.(e);
    },
    [toggleExpanded, handleSelection, nodeId, onClick]
  );

  return (
    <button
      type="button"
      aria-current={isSelected ? "true" : undefined}
      data-selected={isSelected ? "" : undefined}
      className={cn(
        "group relative flex w-full cursor-pointer items-center text-left outline-none",
        "transition-colors duration-100 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
        "focus-visible:ring-1 focus-visible:ring-accent-primary/40",
        className
      )}
      onClick={handleClick}
      style={{ paddingLeft: level * indent + 8 }}
      {...props}
    >
      {children}
    </button>
  );
};

// ---------------------------------------------------------------------------
// <TreeNodeContent> — collapsible children wrapper
// ---------------------------------------------------------------------------

export type TreeNodeContentProps = HTMLAttributes<HTMLDivElement> & {
  forceMount?: boolean;
};

export const TreeNodeContent = ({
  children,
  className,
  forceMount,
  ...props
}: TreeNodeContentProps) => {
  const { expandedIds } = useTree();
  const { nodeId } = useNode();
  const isExpanded = expandedIds.has(nodeId);

  if (!isExpanded && !forceMount) {
    return null;
  }

  return (
    <div
      className={cn(!isExpanded && "hidden", className)}
      role="group"
      {...props}
    >
      {children}
    </div>
  );
};

// ---------------------------------------------------------------------------
// <TreeExpander> — chevron toggle
// ---------------------------------------------------------------------------

export type TreeExpanderProps = ComponentPropsWithoutRef<"span"> & {
  hasChildren?: boolean;
};

export const TreeExpander = ({
  hasChildren = false,
  className,
  ...props
}: TreeExpanderProps) => {
  const { expandedIds } = useTree();
  const { nodeId } = useNode();
  const isExpanded = expandedIds.has(nodeId);

  if (!hasChildren) {
    return <span className="inline-flex h-4 w-4 shrink-0" aria-hidden />;
  }

  return (
    <span
      className={cn(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground",
        "transition-transform duration-100 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
        isExpanded && "rotate-90",
        className
      )}
      aria-hidden
      {...props}
    >
      <ChevronRight className="h-3 w-3" />
    </span>
  );
};

// ---------------------------------------------------------------------------
// <TreeIcon> — file/folder icon
// ---------------------------------------------------------------------------

export type TreeIconProps = ComponentPropsWithoutRef<"span"> & {
  icon?: ReactNode;
  hasChildren?: boolean;
};

export const TreeIcon = ({
  icon,
  hasChildren = false,
  className,
  ...props
}: TreeIconProps) => {
  const { showIcons, expandedIds } = useTree();
  const { nodeId } = useNode();
  const isExpanded = expandedIds.has(nodeId);

  if (!showIcons) {
    return null;
  }

  const getDefaultIcon = () => {
    if (!hasChildren) {
      return <File className="h-3.5 w-3.5" />;
    }
    if (isExpanded) {
      return <FolderOpen className="h-3.5 w-3.5" />;
    }
    return <Folder className="h-3.5 w-3.5" />;
  };

  return (
    <span
      className={cn(
        "mr-1.5 inline-flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground/70",
        className
      )}
      aria-hidden
      {...props}
    >
      {icon ?? getDefaultIcon()}
    </span>
  );
};

// ---------------------------------------------------------------------------
// <TreeLabel> — text label
// ---------------------------------------------------------------------------

export type TreeLabelProps = HTMLAttributes<HTMLSpanElement>;

export const TreeLabel = ({ className, ...props }: TreeLabelProps) => (
  <span className={cn("flex-1 truncate text-sm", className)} {...props} />
);

// ---------------------------------------------------------------------------
// Re-export hook for consumers
// ---------------------------------------------------------------------------

export { useTree, useNode };
