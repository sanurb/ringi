/**
 * Ringi Review — Pi extension for local-first code review.
 *
 * Registers `/ringi-review` command that:
 * 1. Ensures ringi server is running
 * 2. Creates a review session via Ringi's HTTP API
 * 3. Opens the Ringi web UI in the browser
 * 4. Shows a "waiting for review" TUI widget
 * 5. Polls review status via HTTP until approved/changes_requested
 * 6. Fetches structured feedback and hands it off to the agent
 *
 * Handoff modes:
 *   --send    → pi.sendUserMessage() — auto-submits feedback, triggers agent turn
 *   (default) → ctx.ui.setEditorText() — user can edit before pressing Enter
 *
 * Architecture: All mutations go through the Ringi HTTP API (not CLI).
 * The CLI is only used for `ringi serve` (server lifecycle) and `which`
 * (install detection). This matches how Ringi's MCP server works.
 */
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";

export default function (pi: ExtensionAPI) {
  const DEFAULT_PORT = 3000;
  const POLL_INTERVAL_MS = 2000;
  const SERVER_STARTUP_TIMEOUT_MS = 10_000;
  const SERVER_STARTUP_POLL_MS = 500;

  // Guard against double-invoke
  let activeReviewInProgress = false;
  // Track review session for context injection
  let lastReviewId: string | null = null;
  let lastReviewStatus: string | null = null;

  // ---------------------------------------------------------------------------
  // HTTP helpers — all Ringi interaction goes through the HTTP API
  // ---------------------------------------------------------------------------

  async function httpGet(
    port: number,
    path: string
  ): Promise<{ ok: boolean; body: string }> {
    const result = await pi.exec(
      "curl",
      ["-sf", `http://localhost:${port}${path}`],
      { timeout: 10_000 }
    );
    return { ok: result.code === 0, body: result.stdout };
  }

  async function httpPost(
    port: number,
    path: string,
    payload: Record<string, unknown>
  ): Promise<{ ok: boolean; body: string; stderr: string }> {
    const result = await pi.exec(
      "curl",
      [
        "-sf",
        "-X",
        "POST",
        "-H",
        "Content-Type: application/json",
        "-d",
        JSON.stringify(payload),
        `http://localhost:${port}${path}`,
      ],
      { timeout: 30_000 }
    );
    return {
      ok: result.code === 0,
      body: result.stdout,
      stderr: result.stderr,
    };
  }

  // ---------------------------------------------------------------------------
  // Server lifecycle
  // ---------------------------------------------------------------------------

  async function isServerRunning(port: number): Promise<boolean> {
    const { ok } = await httpGet(port, "/api/health");
    return ok;
  }

  async function ensureServer(
    ctx: ExtensionCommandContext,
    port: number
  ): Promise<boolean> {
    if (await isServerRunning(port)) return true;

    ctx.ui.notify("Starting ringi server…", "info");

    // Start server — capture handle so we can detect immediate crash
    const serverExec = pi.exec(
      "ringi",
      ["serve", "--no-open", "--port", String(port)],
      {}
    );

    const maxAttempts = Math.ceil(
      SERVER_STARTUP_TIMEOUT_MS / SERVER_STARTUP_POLL_MS
    );
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) =>
        setTimeout(resolve, SERVER_STARTUP_POLL_MS)
      );

      // Check if server process already exited (crash)
      const finished = await Promise.race([
        serverExec.then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 50)),
      ]);
      if (finished) {
        // Server exited immediately — something went wrong
        return false;
      }

      if (await isServerRunning(port)) return true;
    }
    return false;
  }

  async function hasRingiCli(): Promise<boolean> {
    // Works on macOS/Linux; on Windows try `where`
    const cmd = process.platform === "win32" ? "where" : "which";
    const result = await pi.exec(cmd, ["ringi"], { timeout: 3000 });
    return result.code === 0;
  }

  // ---------------------------------------------------------------------------
  // Review creation — via HTTP API, not CLI
  // ---------------------------------------------------------------------------

  async function hasStagedChanges(port: number): Promise<boolean> {
    const { ok, body } = await httpGet(port, "/api/git/staged");
    if (!ok) return false;
    try {
      const data = JSON.parse(body);
      return data.hasStagedChanges === true;
    } catch {
      return false;
    }
  }

  async function createReviewViaApi(
    ctx: ExtensionCommandContext,
    port: number,
    source: string,
    opts: { branch?: string; commits?: string }
  ): Promise<{ reviewId: string } | null> {
    const payload: Record<string, unknown> = { sourceType: source };
    if (opts.branch) payload.sourceRef = opts.branch;
    if (opts.commits) payload.sourceRef = opts.commits;

    const { ok, body, stderr } = await httpPost(port, "/api/reviews", payload);

    if (!ok) {
      ctx.ui.notify(
        `Failed to create review: ${stderr || body || "server error"}`,
        "error"
      );
      return null;
    }

    try {
      const review = JSON.parse(body);
      const reviewId = review.id;
      if (!reviewId) {
        ctx.ui.notify("Review created but no ID returned.", "error");
        return null;
      }
      return { reviewId };
    } catch {
      ctx.ui.notify("Failed to parse review response.", "error");
      return null;
    }
  }

  async function createPrReviewViaCli(
    ctx: ExtensionCommandContext,
    prUrl: string
  ): Promise<{ reviewId: string } | null> {
    // PR reviews go through CLI because they involve git/gh preflight
    const result = await pi.exec(
      "ringi",
      ["review", "pr", prUrl, "--no-open", "--json"],
      { cwd: ctx.cwd, timeout: 60_000 }
    );

    if (result.code !== 0) {
      const msg = result.stderr.trim() || result.stdout.trim();
      ctx.ui.notify(`Failed to create PR review: ${msg}`, "error");
      return null;
    }

    try {
      const envelope = JSON.parse(result.stdout);
      // CLI envelope shape: { ok, command, result: { reviewId, ... } }
      const reviewId = envelope.result?.reviewId;
      if (!reviewId) {
        ctx.ui.notify("PR review created but no ID returned.", "error");
        return null;
      }
      return { reviewId };
    } catch {
      ctx.ui.notify("Failed to parse PR review response.", "error");
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Status polling — via HTTP API, not CLI
  // ---------------------------------------------------------------------------

  async function pollReviewStatus(
    port: number,
    reviewId: string,
    signal: { cancelled: boolean }
  ): Promise<"approved" | "changes_requested" | "cancelled"> {
    while (!signal.cancelled) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      if (signal.cancelled) return "cancelled";

      const { ok, body } = await httpGet(port, `/api/reviews/${reviewId}`);

      if (ok) {
        try {
          const review = JSON.parse(body);
          const status = review.status;
          if (status === "approved" || status === "changes_requested") {
            return status;
          }
        } catch {
          /* continue polling */
        }
      }
    }
    return "cancelled";
  }

  // ---------------------------------------------------------------------------
  // Feedback retrieval — via HTTP API
  // ---------------------------------------------------------------------------

  async function fetchFeedback(
    port: number,
    reviewId: string
  ): Promise<string | null> {
    const { ok, body } = await httpGet(
      port,
      `/api/reviews/${reviewId}/feedback`
    );

    if (ok) {
      try {
        const data = JSON.parse(body);
        if (data.markdown) return data.markdown;
      } catch {
        /* fall through */
      }
    }

    // Fallback: CLI export (read-only, doesn't need server-commands)
    const exportResult = await pi.exec(
      "ringi",
      ["review", "export", reviewId, "--stdout"],
      { timeout: 10_000 }
    );
    return exportResult.code === 0 ? exportResult.stdout : null;
  }

  // ---------------------------------------------------------------------------
  // Waiting UI — TUI widget shown while the user reviews in the browser
  // ---------------------------------------------------------------------------

  function showWaitingUI(ctx: ExtensionCommandContext): {
    promise: Promise<"escape" | "settled">;
    dismiss: () => void;
  } {
    let settled = false;
    let doneFn: ((result: "escape" | "settled") => void) | null = null;
    let pendingResult: "escape" | "settled" | null = null;

    const finish = (result: "escape" | "settled"): void => {
      if (settled) return;
      settled = true;
      if (doneFn) {
        doneFn(result);
      } else {
        pendingResult = result;
      }
    };

    const promise = ctx.ui.custom<"escape" | "settled">(
      (_tui, theme, _kb, done) => {
        doneFn = done;
        if (pendingResult != null) {
          const r = pendingResult;
          pendingResult = null;
          queueMicrotask(() => done(r));
        }

        return {
          render(width: number): string[] {
            const innerW = Math.max(30, width - 2);
            const top = theme.fg("border", `╭${"─".repeat(innerW)}╮`);
            const bot = theme.fg("border", `╰${"─".repeat(innerW)}╯`);
            const lines = [
              theme.fg("accent", theme.bold(" Ringi Review in Progress")),
              " Review is open in the browser.",
              " Approve or request changes in Ringi to continue.",
              " Press Escape to cancel and return.",
            ];
            return [
              top,
              ...lines.map(
                (l) =>
                  `${theme.fg("border", "│")}${truncateToWidth(l, innerW, "...", true).padEnd(innerW)}${theme.fg("border", "│")}`
              ),
              bot,
            ];
          },
          handleInput(data: string): void {
            if (matchesKey(data, Key.escape)) finish("escape");
          },
          invalidate(): void {},
        };
      }
    );

    return { promise, dismiss: () => finish("settled") };
  }

  // ---------------------------------------------------------------------------
  // Argument parser
  // ---------------------------------------------------------------------------

  function parseReviewArgs(args: string): {
    source: string;
    branch?: string;
    commits?: string;
    prUrl?: string;
    port: number;
    autoSend: boolean;
  } {
    const parts = args.trim().split(/\s+/).filter(Boolean);
    let source = "staged";
    let branch: string | undefined;
    let commits: string | undefined;
    let prUrl: string | undefined;
    let port = DEFAULT_PORT;
    let autoSend = false;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part === "--branch" && parts[i + 1]) {
        source = "branch";
        branch = parts[++i];
      } else if (part === "--commits" && parts[i + 1]) {
        source = "commits";
        commits = parts[++i];
      } else if (part === "--pr" && parts[i + 1]) {
        prUrl = parts[++i];
      } else if (part === "--source" && parts[i + 1]) {
        source = parts[++i]!;
      } else if (part === "--port" && parts[i + 1]) {
        port = Number.parseInt(parts[++i]!, 10) || DEFAULT_PORT;
      } else if (part === "--send") {
        autoSend = true;
      }
    }

    return { source, branch, commits, prUrl, port, autoSend };
  }

  // ---------------------------------------------------------------------------
  // /ringi-review command
  // ---------------------------------------------------------------------------

  pi.registerCommand("ringi-review", {
    description:
      "Create a Ringi review session and open it in the browser. " +
      "Usage: /ringi-review [--branch <name>] [--commits <shas>] [--pr <url>] [--port <n>] [--send]",
    handler: async (args, ctx) => {
      // Double-invoke guard
      if (activeReviewInProgress) {
        ctx.ui.notify(
          "A review is already in progress. Press Escape in the waiting widget first.",
          "warning"
        );
        return;
      }

      // Pre-flight: check ringi is installed
      if (!(await hasRingiCli())) {
        ctx.ui.notify(
          "ringi not found. Install with: npm install -g @sanurb/ringi",
          "error"
        );
        return;
      }

      const parsed = parseReviewArgs(args);
      const port = parsed.port;
      const autoSend = parsed.autoSend;

      // 1. Ensure server is running
      if (!(await ensureServer(ctx, port))) {
        ctx.ui.notify(
          "Could not start ringi server. Run 'ringi serve' manually.",
          "error"
        );
        return;
      }

      // 2. Pre-check: staged changes exist (for staged source only)
      if (parsed.source === "staged" && !parsed.prUrl) {
        const hasStaged = await hasStagedChanges(port);
        if (!hasStaged) {
          ctx.ui.notify(
            "No staged changes. Stage files first: git add <files>",
            "error"
          );
          return;
        }
      }

      activeReviewInProgress = true;

      try {
        // 3. Create review session
        let review: { reviewId: string } | null;
        if (parsed.prUrl) {
          review = await createPrReviewViaCli(ctx, parsed.prUrl);
        } else {
          review = await createReviewViaApi(ctx, port, parsed.source, parsed);
        }

        if (!review) {
          return;
        }

        ctx.ui.notify(`Review ${review.reviewId} created.`, "info");

        // 4. Open browser — correct URL path is /reviews/ (plural)
        const reviewUrl = `http://localhost:${port}/reviews/${review.reviewId}`;

        const openCmd =
          process.platform === "darwin"
            ? "open"
            : process.platform === "win32"
              ? "start"
              : "xdg-open";
        await pi.exec(openCmd, [reviewUrl], { cwd: ctx.cwd });

        // 5. Show waiting UI and poll status in parallel
        const waitingUI = showWaitingUI(ctx);
        const cancelSignal = { cancelled: false };

        const pollPromise = pollReviewStatus(
          port,
          review.reviewId,
          cancelSignal
        );

        const result = await Promise.race([
          waitingUI.promise.then((r) => ({
            type: "ui" as const,
            reason: r,
          })),
          pollPromise.then((s) => ({
            type: "poll" as const,
            status: s,
          })),
        ]);

        // Handle escape
        if (result.type === "ui" && result.reason === "escape") {
          cancelSignal.cancelled = true;
          ctx.ui.notify("Review cancelled.", "info");
          return;
        }

        // Wait for poll to resolve if UI settled first
        const status =
          result.type === "poll" ? result.status : await pollPromise;

        waitingUI.dismiss();
        await waitingUI.promise;

        if (status === "cancelled") {
          ctx.ui.notify("Review cancelled.", "info");
          return;
        }

        // 6. Persist review state for context injection
        lastReviewId = review.reviewId;
        lastReviewStatus = status;
        pi.appendEntry("ringi-review", {
          reviewId: review.reviewId,
          status,
        });

        // 7. Fetch feedback and hand off
        const feedback = await fetchFeedback(port, review.reviewId);
        if (feedback && feedback.trim()) {
          const prompt = `Please address the following review feedback:\n\n${feedback.trim()}`;

          if (autoSend) {
            // Auto-send mode: fire-and-forget, triggers agent turn
            pi.sendUserMessage(prompt);
            ctx.ui.notify(
              status === "approved"
                ? "Review approved ✓ — feedback sent to agent."
                : "Changes requested — feedback sent to agent.",
              status === "approved" ? "success" : "info"
            );
          } else {
            // Default: insert into editor, user presses Enter
            ctx.ui.setEditorText(prompt);
            ctx.ui.notify(
              status === "approved"
                ? "Review approved ✓ — feedback inserted into editor."
                : "Changes requested — feedback inserted into editor.",
              status === "approved" ? "success" : "info"
            );
          }
        } else {
          if (autoSend && status === "changes_requested") {
            pi.sendUserMessage(
              "Code review completed — changes were requested but no specific comments were provided. Ask the user what they'd like changed."
            );
          }
          ctx.ui.notify(
            status === "approved"
              ? "Review approved ✓ — no comments to address."
              : "Changes requested — no comments found.",
            status === "approved" ? "success" : "info"
          );
        }
      } finally {
        activeReviewInProgress = false;
      }
    },
  });

  // ---------------------------------------------------------------------------
  // Context injection — when a review just completed with "changes_requested",
  // inject a context message so the agent knows it's in a post-review state.
  // ---------------------------------------------------------------------------

  pi.on("before_agent_start", async () => {
    if (!lastReviewId || lastReviewStatus !== "changes_requested") return;

    // Clear after one injection — the agent got the message
    const reviewId = lastReviewId;
    lastReviewId = null;
    lastReviewStatus = null;

    return {
      message: {
        customType: "ringi-review-context",
        content:
          `[RINGI REVIEW - CHANGES REQUESTED]\n` +
          `Review ${reviewId} requested changes. Address all feedback before proceeding.\n` +
          `When done, the user can run /ringi-review again to re-review.`,
        display: false,
      },
    };
  });

  // ---------------------------------------------------------------------------
  // Session restore — if Pi restarts mid-review, restore the last review
  // state from persisted session entries.
  // ---------------------------------------------------------------------------

  pi.on("session_start", async (_event, ctx) => {
    const entries = ctx.sessionManager.getEntries();
    const lastEntry = entries.findLast(
      (e: { type: string; customType?: string }) =>
        e.type === "custom" && e.customType === "ringi-review"
    ) as { data?: { reviewId?: string; status?: string } } | undefined;

    if (lastEntry?.data) {
      lastReviewId = lastEntry.data.reviewId ?? null;
      lastReviewStatus = lastEntry.data.status ?? null;
    }
  });

  // ---------------------------------------------------------------------------
  // Context filtering — strip stale ringi-review-context messages from
  // conversation when no active review feedback is pending.
  // ---------------------------------------------------------------------------

  pi.on("context", async (event) => {
    if (lastReviewStatus === "changes_requested") return;

    return {
      messages: event.messages.filter((m) => {
        const msg = m as { customType?: string };
        return msg.customType !== "ringi-review-context";
      }),
    };
  });

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  pi.on("session_shutdown", async () => {
    // Ringi server is independent — nothing to clean up.
    // The server continues running for subsequent sessions.
  });
}
