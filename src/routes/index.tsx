import {
  createFileRoute,
  useLoaderData,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import * as Effect from "effect/Effect";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ApiClient } from "@/api/api-client";
import type {
  DiffFile as DiffFileType,
  DiffSummary as DiffSummaryType,
} from "@/api/schemas/diff";
import { DIFF_SCOPES } from "@/api/schemas/review";
import type { DiffScope } from "@/api/schemas/review";
import {
  DIFF_SCOPE_EMPTY_MESSAGES,
  DiffScopeSelector,
} from "@/components/review/diff-scope-selector";
import { DraftRecoveryModal } from "@/components/review/draft-recovery-modal";
import { ExportFeedbackModal } from "@/components/review/export-feedback-modal";
import { Button } from "@/components/ui/button";
import { getDiffSummary, parseDiff } from "@/core/services/diff.service";
import { GitService } from "@/core/services/git.service";
import { clientRuntime } from "@/lib/client-runtime";
import type { ExportableComment } from "@/lib/format-review-feedback";
import {
  clearDraft,
  isDraftRecoverable,
  loadDraft,
  saveDraft,
} from "@/lib/session-draft";
import type { SessionDraft } from "@/lib/session-draft";

import type { LocalComment } from "./-shared/diff/diff-file";
import { DiffSummary } from "./-shared/diff/diff-summary";
import { DiffView } from "./-shared/diff/diff-view";
import { useEventSource } from "./-shared/hooks/use-event-source";
import { useKeyboardShortcuts } from "./-shared/hooks/use-keyboard-shortcuts";
import { ActionBar } from "./-shared/layout/action-bar";
import { FileTree } from "./-shared/layout/file-tree";
import { serverRuntime } from "./api/$";

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const DEFAULT_DIFF_SCOPE = "staged" as const satisfies DiffScope;

const isDiffScope = (value: unknown): value is DiffScope =>
  typeof value === "string" && DIFF_SCOPES.includes(value as DiffScope);

const getDiffScope = (value: unknown): DiffScope =>
  isDiffScope(value) ? value : DEFAULT_DIFF_SCOPE;

/** Pick the first non-binary, commentable file. */
const pickDefaultFile = (files: readonly DiffFileType[]): string | null => {
  for (const file of files) {
    if (file.hunks.length > 0) {
      return file.newPath;
    }
  }

  // Fallback: first file regardless (binary/mode-change still navigable)
  return files[0]?.newPath ?? null;
};

// ---------------------------------------------------------------------------
// Server function
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const EmptyDiffState = ({ message }: { message: string }) => (
  <div className="rounded-sm border border-border-default bg-surface-elevated p-8 text-center">
    <p className="text-sm text-text-tertiary">{message}</p>
  </div>
);

const DiffContent = ({
  hasFiles,
  emptyMessage,
  file,
  diffMode,
  summary,
  onLocalCommentsChange,
  viewed,
  onToggleViewed,
}: {
  hasFiles: boolean;
  emptyMessage: string;
  file: DiffFileType | null;
  diffMode: "split" | "unified";
  summary: DiffSummaryType;
  onLocalCommentsChange?: (
    filePath: string,
    localComments: readonly LocalComment[]
  ) => void;
  viewed?: boolean;
  onToggleViewed?: (filePath: string) => void;
}) => {
  if (!hasFiles) {
    return <EmptyDiffState message={emptyMessage} />;
  }

  if (!file) {
    return <EmptyDiffState message="Select a file to view its diff." />;
  }

  return (
    <div className="space-y-3">
      <DiffSummary summary={summary} />
      <DiffView
        file={file}
        diffMode={diffMode}
        onLocalCommentsChange={onLocalCommentsChange}
        viewed={viewed}
        onToggleViewed={onToggleViewed}
      />
    </div>
  );
};

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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const ChangesPage = () => {
  const data = useLoaderData({ from: "/" });
  const navigate = useNavigate();
  const router = useRouter();
  useEventSource({ onEvent: () => router.invalidate() });

  // ── Selection state ──────────────────────────────────────────────────
  const [selectedFile, setSelectedFile] = useState<string | null>(() =>
    pickDefaultFile(data.files)
  );
  const [viewedFiles, setViewedFiles] = useState<ReadonlySet<string>>(
    new Set()
  );
  const [diffMode, setDiffMode] = useState<"split" | "unified">("split");
  const [pendingScope, setPendingScope] = useState<DiffScope | null>(null);

  // ── Export state ─────────────────────────────────────────────────────
  const [exportOpen, setExportOpen] = useState(false);
  const localCommentsRef = useRef(new Map<string, readonly LocalComment[]>());
  const [localCommentSnapshot, setLocalCommentSnapshot] = useState<
    readonly ExportableComment[]
  >([]);

  // ── Draft recovery state ─────────────────────────────────────────────
  const [recoveryDraft, setRecoveryDraft] = useState<SessionDraft | null>(
    () => {
      const draft = loadDraft();
      return isDraftRecoverable(draft, data.scope) ? draft : null;
    }
  );

  // ── Derived ──────────────────────────────────────────────────────────
  const selectedFileData = useMemo(
    () => data.files.find((f) => f.newPath === selectedFile) ?? null,
    [data.files, selectedFile]
  );

  // ── Reset on scope change ────────────────────────────────────────────
  useEffect(() => {
    setSelectedFile(pickDefaultFile(data.files));
    setViewedFiles(new Set());
    setPendingScope(null);
  }, [data.scope, data.files]);

  // ── Explicit viewed toggle (no auto-marking) ────────────────────────
  const handleToggleViewed = useCallback((filePath: string) => {
    setViewedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }

      return next;
    });
  }, []);

  // ── Persist draft on navigation changes ──────────────────────────────
  useEffect(() => {
    if (viewedFiles.size === 0) {
      return;
    }

    saveDraft({
      scope: data.scope,
      selectedFile,
      viewedFiles: [...viewedFiles],
    });
  }, [viewedFiles, selectedFile, data.scope]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────
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

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleSelectFile = useCallback((path: string) => {
    setSelectedFile(path);
  }, []);

  const handleLocalCommentsChange = useCallback(
    (filePath: string, comments: readonly LocalComment[]) => {
      if (comments.length === 0) {
        localCommentsRef.current.delete(filePath);
      } else {
        localCommentsRef.current.set(filePath, comments);
      }
    },
    []
  );

  const handleExport = useCallback(() => {
    const all: ExportableComment[] = [];
    for (const comments of localCommentsRef.current.values()) {
      for (const c of comments) {
        all.push({
          content: c.content,
          filePath: c.filePath,
          lineNumber: c.lineNumber,
          lineType: c.lineType,
          suggestion: c.suggestion,
        });
      }
    }
    setLocalCommentSnapshot(all);
    setExportOpen(true);
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

  // ── File-level actions ───────────────────────────────────────────────

  const handleGitAdd = useCallback(() => {
    if (!selectedFile) {
      return;
    }

    clientRuntime.runFork(
      Effect.gen(function* gitAddFile() {
        const { http } = yield* ApiClient;
        return yield* http.git.stage({ payload: { files: [selectedFile] } });
      }).pipe(
        Effect.tap(() => Effect.promise(() => router.invalidate())),
        Effect.catchAllCause(() => Effect.void)
      )
    );
  }, [selectedFile, router]);

  const handleCopyFileDiff = useCallback(async () => {
    if (!selectedFileData) {
      return;
    }

    const text = selectedFileData.hunks
      .flatMap((hunk) => hunk.lines.map((line) => line.content))
      .join("\n");
    await navigator.clipboard.writeText(text);
  }, [selectedFileData]);

  // ── Draft recovery handlers ──────────────────────────────────────────
  const handleRestoreDraft = useCallback(() => {
    if (!recoveryDraft) {
      return;
    }

    setViewedFiles(new Set(recoveryDraft.viewedFiles));

    if (
      recoveryDraft.selectedFile &&
      data.files.some((f) => f.newPath === recoveryDraft.selectedFile)
    ) {
      setSelectedFile(recoveryDraft.selectedFile);
    }

    setRecoveryDraft(null);
    clearDraft();
  }, [recoveryDraft, data.files]);

  const handleDismissDraft = useCallback(() => {
    setRecoveryDraft(null);
    clearDraft();
  }, []);

  // ── Derived display state ────────────────────────────────────────────
  const displayedScope = pendingScope ?? data.scope;
  const isScopePending = pendingScope !== null && pendingScope !== data.scope;
  const emptyStateMessage = DIFF_SCOPE_EMPTY_MESSAGES[data.scope];
  const showGitAdd = data.scope === "unstaged" || data.scope === "uncommitted";

  return (
    <div className="flex h-full flex-col">
      <ActionBar
        repoName={data.repository.name}
        branchName={data.repository.branch}
        diffMode={diffMode}
        onToggleDiffMode={toggleDiffMode}
        onExport={handleExport}
        selectedFilePath={selectedFile}
        onGitAdd={showGitAdd ? handleGitAdd : undefined}
        onCopyFileDiff={handleCopyFileDiff}
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
          onSelectFile={handleSelectFile}
          selectedFile={selectedFile}
          reviewedFiles={viewedFiles}
          onToggleViewed={handleToggleViewed}
        />

        <div className="flex-1 overflow-y-auto bg-surface-primary p-4">
          <DiffContent
            hasFiles={data.files.length > 0}
            emptyMessage={emptyStateMessage}
            file={selectedFileData}
            diffMode={diffMode}
            summary={data.summary}
            onLocalCommentsChange={handleLocalCommentsChange}
            viewed={selectedFile ? viewedFiles.has(selectedFile) : false}
            onToggleViewed={handleToggleViewed}
          />
        </div>
      </div>

      <ExportFeedbackModal
        open={exportOpen}
        onOpenChange={setExportOpen}
        localComments={localCommentSnapshot}
      />

      {recoveryDraft ? (
        <DraftRecoveryModal
          open
          draft={recoveryDraft}
          onRestore={handleRestoreDraft}
          onDismiss={handleDismissDraft}
        />
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

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
