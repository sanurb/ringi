import { useState, useCallback, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import * as Effect from "effect/Effect";
import { serverRuntime } from "./api/$";
import { GitService } from "./api/-lib/services/git.service";
import { parseDiff, getDiffSummary } from "./api/-lib/services/diff.service";
import { DiffView } from "./-shared/diff/diff-view";
import { Sidebar } from "./-shared/layout/sidebar";
import { useKeyboardShortcuts } from "./-shared/hooks/use-keyboard-shortcuts";

const loadStagedDiff = createServerFn({ method: "GET" }).handler(async () => {
  return serverRuntime.runPromise(
    Effect.gen(function* () {
      const git = yield* GitService;
      const diffText = yield* git.getStagedDiff;
      const files = parseDiff(diffText);
      const summary = getDiffSummary(files);
      const repository = yield* git.getRepositoryInfo;
      return { files, summary, repository };
    }),
  );
});

export const Route = createFileRoute("/")({
  loader: () => loadStagedDiff(),
  component: StagedChangesPage,
});

function StagedChangesPage() {
  const data = Route.useLoaderData();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const navigate = useNavigate();

  const shortcuts = useMemo(
    () => [
      { key: "n", description: "New review", handler: () => { window.location.href = "/reviews/new"; } },
      { key: "r", description: "Go to Reviews", handler: () => navigate({ to: "/reviews" }) },
    ],
    [navigate],
  );
  useKeyboardShortcuts(shortcuts);

  const scrollToFile = useCallback((path: string) => {
    setSelectedFile(path);
    const el = document.getElementById(
      `diff-file-${path.replace(/\//g, "-")}`,
    );
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div className="flex h-[calc(100vh-49px)]">
      <Sidebar
        files={data.files}
        selectedFile={selectedFile}
        onSelectFile={scrollToFile}
      />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-100">
              Staged Changes
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {data.repository.name} &middot; {data.repository.branch}
            </p>
          </div>
          <a
            href="/reviews/new"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
          >
            New Review
          </a>
        </div>

        <DiffView files={data.files} summary={data.summary} />
      </div>
    </div>
  );
}
