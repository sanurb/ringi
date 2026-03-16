import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import * as Effect from "effect/Effect";
import { serverRuntime } from "../api/$";
import { GitService } from "../api/-lib/services/git.service";
import { parseDiff, getDiffSummary } from "../api/-lib/services/diff.service";

interface NewReviewData {
  repository: { name: string; branch: string; path: string };
  hasStagedChanges: boolean;
  stagedSummary: { filesChanged: number; additions: number; deletions: number };
}

const loadNewReviewData = createServerFn({ method: "GET" }).handler(
  async (): Promise<NewReviewData> => {
    return serverRuntime.runPromise(
      Effect.gen(function* () {
        const git = yield* GitService;
        const repository = yield* git.getRepositoryInfo;
        const stagedFiles = yield* git.getStagedFiles;
        const hasStagedChanges = stagedFiles.length > 0;

        let stagedSummary = { filesChanged: 0, additions: 0, deletions: 0 };
        if (hasStagedChanges) {
          const diffText = yield* git.getStagedDiff;
          const files = parseDiff(diffText);
          const summary = getDiffSummary(files);
          stagedSummary = {
            filesChanged: files.length,
            additions: summary.totalAdditions,
            deletions: summary.totalDeletions,
          };
        }

        return { repository, hasStagedChanges, stagedSummary };
      }),
    );
  },
);

export const Route = createFileRoute("/reviews/new")({
  loader: () => loadNewReviewData(),
  component: NewReviewPage,
});

function NewReviewPage() {
  const data = Route.useLoaderData();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repositoryPath: data.repository.path,
          sourceType: "staged",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `Failed to create review (${res.status})`);
      }
      const review = await res.json();
      navigate({ to: "/reviews/$reviewId", params: { reviewId: review.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create review");
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6">
        <a
          href="/"
          className="text-sm text-gray-500 transition hover:text-gray-300"
        >
          &larr; Back to changes
        </a>
      </div>

      <h1 className="mb-6 text-2xl font-semibold text-gray-100">New Review</h1>

      {/* Repository info */}
      <div className="mb-6 rounded-lg border border-gray-800 bg-surface-elevated p-4">
        <h2 className="mb-3 text-sm font-medium text-gray-400">Repository</h2>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Name</span>
            <span className="text-sm text-gray-200">{data.repository.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Branch</span>
            <span className="text-sm text-gray-200">{data.repository.branch}</span>
          </div>
        </div>
      </div>

      {/* Staged changes summary */}
      <div className="mb-6 rounded-lg border border-gray-800 bg-surface-elevated p-4">
        <h2 className="mb-3 text-sm font-medium text-gray-400">Staged Changes</h2>
        {data.hasStagedChanges ? (
          <div className="flex gap-6">
            <div>
              <span className="text-2xl font-bold text-gray-100">
                {data.stagedSummary.filesChanged}
              </span>
              <span className="ml-1 text-sm text-gray-500">
                {data.stagedSummary.filesChanged === 1 ? "file" : "files"}
              </span>
            </div>
            <div>
              <span className="text-2xl font-bold text-green-400">
                +{data.stagedSummary.additions}
              </span>
            </div>
            <div>
              <span className="text-2xl font-bold text-red-400">
                -{data.stagedSummary.deletions}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            No staged changes. Stage some files first with{" "}
            <code className="rounded bg-gray-800 px-1.5 py-0.5 text-xs text-gray-300">
              git add
            </code>
          </p>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-800/50 bg-red-900/20 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Create button */}
      <button
        type="button"
        onClick={handleCreate}
        disabled={!data.hasStagedChanges || creating}
        className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {creating ? "Creating..." : "Create Review"}
      </button>
    </div>
  );
}
