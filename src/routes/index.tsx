import {
  createFileRoute,
  useLoaderData,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import * as Effect from "effect/Effect";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DIFF_SCOPES } from "@/api/schemas/review";
import type { DiffScope } from "@/api/schemas/review";
import {
  DIFF_SCOPE_EMPTY_MESSAGES,
  DiffScopeSelector,
} from "@/components/review/diff-scope-selector";
import { Button } from "@/components/ui/button";
import { getDiffSummary, parseDiff } from "@/core/services/diff.service";
import { GitService } from "@/core/services/git.service";

import { DiffView } from "./-shared/diff/diff-view";
import { useEventSource } from "./-shared/hooks/use-event-source";
import { useKeyboardShortcuts } from "./-shared/hooks/use-keyboard-shortcuts";
import { ActionBar } from "./-shared/layout/action-bar";
import { FileTree } from "./-shared/layout/file-tree";
import { serverRuntime } from "./api/$";

const DEFAULT_DIFF_SCOPE = "staged" as const satisfies DiffScope;

const isDiffScope = (value: unknown): value is DiffScope =>
  typeof value === "string" && DIFF_SCOPES.includes(value as DiffScope);

const getDiffScope = (value: unknown): DiffScope =>
  isDiffScope(value) ? value : DEFAULT_DIFF_SCOPE;

const loadScopedDiff = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => {
    const data = input as Record<string, unknown> | undefined;
    return { scope: getDiffScope(data?.scope) };
  })
  .handler(({ data }) =>
    serverRuntime.runPromise(
      Effect.gen(function* loadScopedDiffEffect() {
        const git = yield* GitService;

        let diffText = "";
        switch (data.scope) {
          case "uncommitted": {
            diffText = yield* git.getUncommittedDiff;
            break;
          }
          case "unstaged": {
            diffText = yield* git.getUnstagedDiff;
            break;
          }
          case "last-commit": {
            diffText = yield* git.getLastCommitDiff;
            break;
          }
          default: {
            diffText = yield* git.getStagedDiff;
            break;
          }
        }

        const files = parseDiff(diffText);
        const summary = getDiffSummary(files);
        const repository = yield* git.getRepositoryInfo;
        return { files, repository, scope: data.scope, summary };
      })
    )
  );

const EmptyDiffState = ({ message }: { message: string }) => (
  <div className="rounded-sm border border-border-default bg-surface-elevated p-8 text-center">
    <p className="text-sm text-text-tertiary">{message}</p>
  </div>
);

const IndexError = ({ error }: { error: unknown }) => {
  const message =
    error instanceof Error ? error.message : "Unable to load changes";
  const handleRetry = useCallback(() => {
    window.location.reload();
  }, []);

  return (
    <div className="flex h-full items-center justify-center">
      <div className="rounded-sm border border-border-default bg-surface-elevated p-8 text-center">
        <p className="text-sm font-medium text-status-error">Error</p>
        <p className="mt-2 text-xs text-text-secondary">{message}</p>
        <Button
          className="mt-4"
          onClick={handleRetry}
          size="sm"
          variant="outline"
        >
          Retry
        </Button>
      </div>
    </div>
  );
};

const ChangesPage = () => {
  const data = useLoaderData({ from: "/" });
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diffMode, setDiffMode] = useState<"split" | "unified">("split");
  const [pendingScope, setPendingScope] = useState<DiffScope | null>(null);
  const navigate = useNavigate();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEventSource({ onEvent: () => router.invalidate() });

  useEffect(() => {
    setSelectedFile(null);
    setPendingScope(null);
  }, [data.scope]);

  const shortcuts = useMemo(
    () => [
      {
        description: "New review",
        handler: () => {
          window.location.href = "/reviews/new";
        },
        key: "n",
      },
      {
        description: "Go to Reviews",
        handler: () => navigate({ to: "/reviews" }),
        key: "r",
      },
    ],
    [navigate]
  );
  useKeyboardShortcuts(shortcuts);

  const scrollToFile = useCallback((path: string) => {
    setSelectedFile(path);
    const id = `diff-file-${path.replaceAll("/", "-")}`;
    const el = document.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (el && scrollContainerRef.current) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const toggleDiffMode = useCallback(() => {
    setDiffMode((prev) => (prev === "split" ? "unified" : "split"));
  }, []);

  const handleScopeChange = useCallback(
    async (scope: DiffScope) => {
      if (scope === data.scope) {
        return;
      }

      setPendingScope(scope);
      setSelectedFile(null);
      try {
        await navigate({
          search: (previous) => ({
            ...(previous as Record<string, unknown>),
            scope,
          }),
          to: "/",
        });
      } finally {
        setPendingScope(null);
      }
    },
    [data.scope, navigate]
  );

  const displayedScope = pendingScope ?? data.scope;
  const isScopePending = pendingScope !== null && pendingScope !== data.scope;
  const emptyStateMessage = DIFF_SCOPE_EMPTY_MESSAGES[data.scope];

  return (
    <div className="flex h-full flex-col">
      <ActionBar
        repoName={data.repository.name}
        branchName={data.repository.branch}
        diffMode={diffMode}
        onToggleDiffMode={toggleDiffMode}
      />

      <div className="flex min-h-0 flex-1">
        <FileTree
          key={data.scope}
          emptyStateMessage={emptyStateMessage}
          files={data.files}
          headerAction={
            <DiffScopeSelector
              fileCount={isScopePending ? undefined : data.files.length}
              isLoading={isScopePending}
              onChange={handleScopeChange}
              value={displayedScope}
            />
          }
          onSelectFile={scrollToFile}
          selectedFile={selectedFile}
        />

        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto bg-surface-primary p-4"
        >
          {data.files.length === 0 ? (
            <EmptyDiffState message={emptyStateMessage} />
          ) : (
            <DiffView
              files={data.files}
              summary={data.summary}
              diffMode={diffMode}
              selectedFile={selectedFile}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export const Route = createFileRoute("/")({
  component: ChangesPage,
  errorComponent: IndexError,
  loader: ({ deps }) => {
    const scope = getDiffScope((deps as { scope?: unknown }).scope);
    return loadScopedDiff({ data: { scope } });
  },
  loaderDeps: ({ search }) => ({
    scope: getDiffScope((search as Record<string, unknown>).scope),
  }),
});
