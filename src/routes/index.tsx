import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import * as Effect from "effect/Effect";
import { useCallback, useMemo, useRef, useState } from "react";

import { DiffView } from "./-shared/diff/diff-view";
import { useEventSource } from "./-shared/hooks/use-event-source";
import { useKeyboardShortcuts } from "./-shared/hooks/use-keyboard-shortcuts";
import { ActionBar } from "./-shared/layout/action-bar";
import { FileTree } from "./-shared/layout/file-tree";
import { serverRuntime } from "./api/$";
import { getDiffSummary, parseDiff } from "./api/-lib/services/diff.service";
import { GitService } from "./api/-lib/services/git.service";

const loadStagedDiff = createServerFn({ method: "GET" }).handler(() =>
  serverRuntime.runPromise(
    Effect.gen(function* loadStagedDiff() {
      const git = yield* GitService;
      const diffText = yield* git.getStagedDiff;
      const files = parseDiff(diffText);
      const summary = getDiffSummary(files);
      const repository = yield* git.getRepositoryInfo;
      return { files, repository, summary };
    })
  )
);

function StagedChangesPage() {
  const data = Route.useLoaderData();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diffMode, setDiffMode] = useState<"split" | "unified">("split");
  const navigate = useNavigate();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEventSource({ onEvent: () => router.invalidate() });

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
          files={data.files}
          selectedFile={selectedFile}
          onSelectFile={scrollToFile}
          groupLabel="Staged"
        />

        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto bg-surface-primary p-4"
        >
          <DiffView
            files={data.files}
            summary={data.summary}
            diffMode={diffMode}
            selectedFile={selectedFile}
          />
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/")({
  component: StagedChangesPage,
  loader: () => loadStagedDiff(),
});
