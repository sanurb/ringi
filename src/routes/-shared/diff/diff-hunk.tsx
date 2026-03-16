import { useState, useCallback } from "react";
import type { DiffHunk as DiffHunkType, DiffLine as DiffLineType } from "@/api/schemas/diff";
import { DiffLine, DiffLinePlaceholder, type CommentLineKey } from "./diff-line";

/** Stable empty map to avoid re-renders when no highlighting is available. */
const emptyMap = new Map<string, string>();

/** Minimum consecutive context lines before we collapse the middle. */
const COLLAPSE_THRESHOLD = 7;
/** How many context lines to keep visible on each side of a collapsed region. */
const VISIBLE_EDGE = 3;

/** Props threaded to each DiffLine for inline comment support. */
interface CommentProps {
  onAddComment?: (lineNumber: number, lineType: DiffLineType["type"]) => void;
  activeCommentLine?: CommentLineKey | null;
  reviewId?: string;
  filePath?: string;
}

// ── Line grouping ──────────────────────────────────────────────────

type LineGroup =
  | { kind: "lines"; lines: DiffLineType[] }
  | { kind: "collapsed"; lines: DiffLineType[]; visibleBefore: DiffLineType[]; visibleAfter: DiffLineType[] };

/**
 * Walk `lines` and collapse runs of >6 consecutive context lines.
 * Everything else passes through as `{ kind: 'lines' }` groups.
 */
function groupLines(lines: ReadonlyArray<DiffLineType>): LineGroup[] {
  const groups: LineGroup[] = [];
  let pending: DiffLineType[] = [];
  let contextRun: DiffLineType[] = [];

  function flushPending() {
    if (pending.length > 0) {
      groups.push({ kind: "lines", lines: pending });
      pending = [];
    }
  }

  function flushContextRun() {
    if (contextRun.length >= COLLAPSE_THRESHOLD) {
      // First 3 context lines go to a normal group
      flushPending();
      groups.push({ kind: "lines", lines: contextRun.slice(0, VISIBLE_EDGE) });

      const hidden = contextRun.slice(VISIBLE_EDGE, contextRun.length - VISIBLE_EDGE);
      const after = contextRun.slice(contextRun.length - VISIBLE_EDGE);
      groups.push({
        kind: "collapsed",
        lines: hidden,
        visibleBefore: [],  // already emitted above
        visibleAfter: [],   // emitted below
      });
      groups.push({ kind: "lines", lines: after });
    } else {
      // Not long enough to collapse — add to pending
      pending.push(...contextRun);
    }
    contextRun = [];
  }

  for (const line of lines) {
    if (line.type === "context") {
      if (contextRun.length === 0 && pending.length > 0) {
        // Starting a new context run — flush non-context pending first
        flushPending();
      }
      contextRun.push(line);
    } else {
      // Non-context line: flush any accumulated context run, then queue this line
      flushContextRun();
      pending.push(line);
    }
  }

  // Flush whatever remains
  flushContextRun();
  flushPending();

  return groups;
}

// ── Collapse separator ─────────────────────────────────────────────

function CollapsedSeparator({
  count,
  onExpand,
  className,
}: {
  count: number;
  onExpand: () => void;
  className?: string;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onExpand}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onExpand();
        }
      }}
      className={
        "flex items-center gap-2 px-4 py-0.5 text-[10px] text-text-tertiary " +
        "bg-surface-inset/50 hover:bg-surface-inset cursor-pointer select-none " +
        "border-y border-border-subtle" +
        (className ? ` ${className}` : "")
      }
    >
      <span aria-hidden>▶</span>
      <span>⋯ {count} unmodified lines</span>
    </div>
  );
}

// ── Collapsible region wrapper (local expand state) ────────────────

function CollapsedRegion({
  group,
  children,
  separatorClassName,
}: {
  group: Extract<LineGroup, { kind: "collapsed" }>;
  children: React.ReactNode;
  separatorClassName?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const expand = useCallback(() => setExpanded(true), []);

  if (expanded) {
    return <>{children}</>;
  }

  return (
    <CollapsedSeparator
      count={group.lines.length}
      onExpand={expand}
      className={separatorClassName}
    />
  );
}

// ── Hunk header ────────────────────────────────────────────────────

function HunkHeader({ hunk }: { hunk: DiffHunkType }) {
  return (
    <div className="bg-surface-inset px-4 py-0.5 text-[10px] text-text-tertiary font-mono border-y border-border-subtle">
      @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
    </div>
  );
}

// ── Split view helpers ─────────────────────────────────────────────

/**
 * Pair lines for split view: context lines appear on both sides,
 * removed lines go left, added lines go right.
 */
function pairLines(
  lines: ReadonlyArray<DiffLineType>,
): Array<{ left: DiffLineType | null; right: DiffLineType | null }> {
  const pairs: Array<{ left: DiffLineType | null; right: DiffLineType | null }> = [];
  const removed: DiffLineType[] = [];

  for (const line of lines) {
    if (line.type === "removed") {
      removed.push(line);
    } else if (line.type === "added") {
      const match = removed.shift();
      pairs.push({ left: match ?? null, right: line });
    } else {
      for (const r of removed) {
        pairs.push({ left: r, right: null });
      }
      removed.length = 0;
      pairs.push({ left: line, right: line });
    }
  }

  for (const r of removed) {
    pairs.push({ left: r, right: null });
  }

  return pairs;
}

// ── Unified hunk ───────────────────────────────────────────────────

function UnifiedHunk({
  hunk,
  lineHtml,
  comment,
}: {
  hunk: DiffHunkType;
  lineHtml: Map<string, string>;
  comment: CommentProps;
}) {
  const groups = groupLines(hunk.lines);

  return (
    <div>
      <HunkHeader hunk={hunk} />
      <div>
        {groups.map((group, gi) => {
          if (group.kind === "lines") {
            return group.lines.map((line, li) => (
              <DiffLine
                key={`${line.type}-${line.newLineNumber ?? line.oldLineNumber ?? `${gi}-${li}`}`}
                line={line}
                mode="unified"
                highlightedHtml={lineHtml.get(line.content)}
                {...comment}
              />
            ));
          }
          return (
            <CollapsedRegion
              key={`col-${gi}`}
              group={group}
            >
              <ExpandedUnifiedLines lines={group.lines} groupIndex={gi} lineHtml={lineHtml} comment={comment} />
            </CollapsedRegion>
          );
        })}
      </div>
    </div>
  );
}

// ── Split hunk ─────────────────────────────────────────────────────

function ExpandedUnifiedLines({
  lines,
  groupIndex,
  lineHtml,
  comment,
}: {
  lines: DiffLineType[];
  groupIndex: number;
  lineHtml: Map<string, string>;
  comment: CommentProps;
}) {
  return (
    <>
      {lines.map((line, li) => (
        <DiffLine
          key={`${line.type}-${line.newLineNumber ?? line.oldLineNumber ?? `exp-${groupIndex}-${li}`}`}
          line={line}
          mode="unified"
          highlightedHtml={lineHtml.get(line.content)}
          {...comment}
        />
      ))}
    </>
  );
}

function ExpandedSplitLines({
  lines,
  keyPrefix,
  lineHtml,
  comment,
}: {
  lines: DiffLineType[];
  keyPrefix: string;
  lineHtml: Map<string, string>;
  comment: CommentProps;
}) {
  const pairs = pairLines(lines);
  return <SplitPairs pairs={pairs} keyPrefix={keyPrefix} lineHtml={lineHtml} comment={comment} />;
}

function SplitHunk({
  hunk,
  lineHtml,
  comment,
}: {
  hunk: DiffHunkType;
  lineHtml: Map<string, string>;
  comment: CommentProps;
}) {
  const groups = groupLines(hunk.lines);

  return (
    <div>
      <HunkHeader hunk={hunk} />
      <div className="grid grid-cols-2 divide-x divide-border-subtle">
        {groups.map((group, gi) => {
          if (group.kind === "lines") {
            const pairs = pairLines(group.lines);
            return (
              <SplitPairs key={`split-${group.lines[0]?.newLineNumber ?? group.lines[0]?.oldLineNumber ?? gi}`} pairs={pairs} keyPrefix={`${gi}`} lineHtml={lineHtml} comment={comment} />
            );
          }
          return (
            <CollapsedRegion
              key={`col-${gi}`}
              group={group}
              separatorClassName="col-span-2"
            >
              <ExpandedSplitLines lines={group.lines} keyPrefix={`${gi}-exp`} lineHtml={lineHtml} comment={comment} />
            </CollapsedRegion>
          );
        })}
      </div>
    </div>
  );
}

/** Render paired left/right columns for a set of lines. */
function SplitPairs({
  pairs,
  keyPrefix,
  lineHtml,
  comment,
}: {
  pairs: Array<{ left: DiffLineType | null; right: DiffLineType | null }>;
  keyPrefix: string;
  lineHtml: Map<string, string>;
  comment: CommentProps;
}) {
  return (
    <>
      {/* Left column */}
      <div>
        {pairs.map((pair) =>
          pair.left ? (
            <DiffLine
              key={`${keyPrefix}-l-${pair.left.oldLineNumber ?? pair.left.newLineNumber}`}
              line={pair.left}
              showOldLine
              showNewLine={false}
              mode="split"
              highlightedHtml={lineHtml.get(pair.left.content)}
              {...comment}
            />
          ) : (
            <DiffLinePlaceholder key={`${keyPrefix}-lp-${pair.right?.newLineNumber}`} />
          ),
        )}
      </div>
      {/* Right column */}
      <div>
        {pairs.map((pair) =>
          pair.right ? (
            <DiffLine
              key={`${keyPrefix}-r-${pair.right.newLineNumber ?? pair.right.oldLineNumber}`}
              line={pair.right}
              showOldLine={false}
              showNewLine
              mode="split"
              highlightedHtml={lineHtml.get(pair.right.content)}
              {...comment}
            />
          ) : (
            <DiffLinePlaceholder key={`${keyPrefix}-rp-${pair.left?.oldLineNumber}`} />
          ),
        )}
      </div>
    </>
  );
}

// ── Public component ───────────────────────────────────────────────

export function DiffHunk({
  hunk,
  mode = "unified",
  lineHtml,
  onAddComment,
  activeCommentLine,
  reviewId,
  filePath,
}: {
  hunk: DiffHunkType;
  mode: "split" | "unified";
  lineHtml?: Map<string, string>;
  onAddComment?: (lineNumber: number, lineType: DiffLineType["type"]) => void;
  activeCommentLine?: CommentLineKey | null;
  reviewId?: string;
  filePath?: string;
}) {
  const resolvedMap = lineHtml ?? emptyMap;
  const comment: CommentProps = { onAddComment, activeCommentLine, reviewId, filePath };
  return mode === "split" ? (
    <SplitHunk hunk={hunk} lineHtml={resolvedMap} comment={comment} />
  ) : (
    <UnifiedHunk hunk={hunk} lineHtml={resolvedMap} comment={comment} />
  );
}
