import {
  CircleCheckBigIcon,
  CircleDotIcon,
  CircleIcon,
  GitCommitHorizontalIcon,
  LoaderCircleIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback } from "react";

import type { DiffScope } from "@/api/schemas/review";
import { DIFF_SCOPES } from "@/api/schemas/review";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const DIFF_SCOPE_LABELS = {
  "last-commit": "Last Commit",
  staged: "Staged",
  uncommitted: "Uncommitted",
  unstaged: "Unstaged",
} as const satisfies Record<DiffScope, string>;

export const DIFF_SCOPE_EMPTY_MESSAGES = {
  "last-commit": "No previous commit found",
  staged: "No staged changes — stage files with git add",
  uncommitted: "Working tree clean — no uncommitted changes",
  unstaged: "No unstaged changes — all modifications are staged",
} as const satisfies Record<DiffScope, string>;

const DIFF_SCOPE_ICONS = {
  "last-commit": GitCommitHorizontalIcon,
  staged: CircleCheckBigIcon,
  uncommitted: CircleDotIcon,
  unstaged: CircleIcon,
} as const satisfies Record<DiffScope, LucideIcon>;

interface DiffScopeSelectorProps {
  value: DiffScope;
  onChange: (scope: DiffScope) => void;
  fileCount?: number;
  isLoading?: boolean;
}

const CountBadge = ({
  fileCount,
  isLoading,
}: {
  fileCount?: number;
  isLoading: boolean;
}) => {
  if (isLoading) {
    return (
      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-border-default bg-surface-overlay px-1.5 text-[10px] text-text-tertiary motion-reduce:animate-none">
        <LoaderCircleIcon className="size-3 animate-spin motion-reduce:animate-none" />
      </span>
    );
  }

  if (typeof fileCount !== "number") {
    return null;
  }

  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-border-default bg-surface-overlay px-1.5 text-[10px] font-medium tabular-nums text-text-secondary">
      {fileCount}
    </span>
  );
};

export const DiffScopeSelector = ({
  value,
  onChange,
  fileCount,
  isLoading = false,
}: DiffScopeSelectorProps) => {
  const SelectedIcon = isLoading ? LoaderCircleIcon : DIFF_SCOPE_ICONS[value];
  const handleValueChange = useCallback(
    (scope: string) => {
      onChange(scope as DiffScope);
    },
    [onChange]
  );

  return (
    <Select
      disabled={isLoading}
      onValueChange={handleValueChange}
      value={value}
    >
      <SelectTrigger
        aria-label="Diff scope"
        className={cn(
          "h-7 min-w-0 gap-1.5 rounded-[10px] border-border-subtle bg-surface-primary px-2 text-[11px] font-medium text-text-secondary shadow-none transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 active:scale-[0.97] motion-reduce:transform-none motion-reduce:transition-[color,background-color,border-color,box-shadow,opacity] [&_svg]:text-text-tertiary"
        )}
        size="sm"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <SelectedIcon
            className={cn(
              "size-3.5 shrink-0",
              isLoading && "animate-spin motion-reduce:animate-none"
            )}
          />
          <span className="truncate">{DIFF_SCOPE_LABELS[value]}</span>
        </span>
        <CountBadge fileCount={fileCount} isLoading={isLoading} />
      </SelectTrigger>

      <SelectContent
        align="end"
        className={cn(
          "min-w-44 rounded-xl border border-border-default bg-surface-elevated p-1 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.7)] transition-[opacity,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] data-[state=closed]:scale-95 data-[state=closed]:opacity-0 data-[state=open]:scale-100 data-[state=open]:opacity-100 motion-reduce:transform-none motion-reduce:transition-opacity"
        )}
        position="popper"
      >
        <SelectGroup>
          {DIFF_SCOPES.map((scope) => {
            const Icon = DIFF_SCOPE_ICONS[scope];

            return (
              <SelectItem
                className="rounded-lg px-2 py-1.5 text-xs text-text-secondary focus:bg-surface-overlay focus:text-text-primary"
                key={scope}
                value={scope}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Icon className="size-3.5 shrink-0" />
                  <span className="truncate">{DIFF_SCOPE_LABELS[scope]}</span>
                </span>
              </SelectItem>
            );
          })}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};
