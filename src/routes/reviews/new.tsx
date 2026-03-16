import { useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import { serverRuntime } from "../api/$";
import { GitService } from "../api/-lib/services/git.service";
import { parseDiff, getDiffSummary } from "../api/-lib/services/diff.service";
import { clientRuntime } from "@/lib/client-runtime";
import { ApiClient } from "@/api/api-client";
import { ActionBar } from "../-shared/layout/action-bar";

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

  const handleCreate = () => {
    setCreating(true);
    setError(null);

    clientRuntime.runFork(
      Effect.gen(function* () {
        const { http } = yield* ApiClient;
        return yield* http.reviews.create({
          payload: { sourceType: "staged", sourceRef: null },
        });
      }).pipe(
        Effect.tap((review) =>
          Effect.sync(() =>
            navigate({ to: "/reviews/$reviewId", params: { reviewId: review.id } }),
          ),
        ),
        Effect.tapErrorCause((cause) =>
          Effect.sync(() => {
            setError(Cause.pretty(cause));
            setCreating(false);
          }),
        ),
      ),
    );
  };

  return (
    <div className="flex h-full flex-col">
      <ActionBar repoName={data.repository.name} branchName={data.repository.branch} />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl px-6 py-6">
          <div className="mb-5">
            <Link
              to="/"
              className="text-xs text-text-tertiary transition-colors hover:text-text-secondary"
            >
              &larr; Back to changes
            </Link>
          </div>

          <h1 className="mb-5 text-sm font-semibold text-text-primary">New Review</h1>

          {/* Repository info */}
          <div className="mb-4 rounded-sm border border-border-default bg-surface-elevated p-3">
            <h2 className="mb-2 text-xs font-medium text-text-tertiary">Repository</h2>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-xs text-text-tertiary">Name</span>
                <span className="text-xs text-text-primary">{data.repository.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-text-tertiary">Branch</span>
                <span className="text-xs text-text-primary">{data.repository.branch}</span>
              </div>
            </div>
          </div>

          {/* Staged changes summary */}
          <div className="mb-4 rounded-sm border border-border-default bg-surface-elevated p-3">
            <h2 className="mb-2 text-xs font-medium text-text-tertiary">Staged Changes</h2>
            {data.hasStagedChanges ? (
              <div className="flex gap-4">
                <div>
                  <span className="text-lg font-bold text-text-primary">
                    {data.stagedSummary.filesChanged}
                  </span>
                  <span className="ml-1 text-xs text-text-tertiary">
                    {data.stagedSummary.filesChanged === 1 ? "file" : "files"}
                  </span>
                </div>
                <div>
                  <span className="text-lg font-bold text-status-success">
                    +{data.stagedSummary.additions}
                  </span>
                </div>
                <div>
                  <span className="text-lg font-bold text-status-error">
                    -{data.stagedSummary.deletions}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-text-tertiary">
                No staged changes. Stage some files first with{" "}
                <code className="rounded bg-surface-overlay px-1 py-0.5 text-[10px] text-text-secondary">
                  git add
                </code>
              </p>
            )}
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-3 rounded-sm border border-status-error/30 bg-status-error/10 p-2.5 text-xs text-status-error">
              {error}
            </div>
          )}

          {/* Create button */}
          <button
            type="button"
            onClick={handleCreate}
            disabled={!data.hasStagedChanges || creating}
            className="w-full rounded-sm bg-accent-primary px-4 py-2.5 text-xs font-medium text-white transition-colors hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create Review"}
          </button>
        </div>
      </div>
    </div>
  );
}
