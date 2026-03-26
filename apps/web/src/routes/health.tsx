import { createFileRoute } from "@tanstack/react-router";

type DatabaseCheck =
  | { status: "connected"; latencyMs: number }
  | { status: "skipped" }
  | { status: "error"; latencyMs?: number; httpStatus?: number };

const checkDatabase = async (request: Request): Promise<DatabaseCheck> => {
  const startedAt = Date.now();
  try {
    const url = new URL(request.url);
    const target = new URL("/api/reviews", url);

    const res = await fetch(target, {
      headers: { accept: "application/json" },
      method: "GET",
    });

    const latencyMs = Date.now() - startedAt;
    if (!res.ok) {
      return { status: "error", httpStatus: res.status, latencyMs };
    }

    // Touch the body to exercise JSON + stream path.
    await res.json();
    return { status: "connected", latencyMs };
  } catch {
    const latencyMs = Date.now() - startedAt;
    return { status: "error", latencyMs };
  }
};

export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const deep = url.searchParams.get("deep") === "1";

        const checks = {
          status: "healthy",
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          version: process.env.npm_package_version ?? null,
          database: deep
            ? await checkDatabase(request)
            : ({ status: "skipped" } as const),
        };

        return Response.json(checks, {
          headers: {
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
