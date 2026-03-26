import { createFileRoute } from "@tanstack/react-router";

// ---------------------------------------------------------------------------
// Lazy-initialized API handler
// ---------------------------------------------------------------------------
// The full HTTP + RPC layer graph (Effect services, SQLite, chokidar, etc.)
// is expensive to build. Eagerly initializing it at module evaluation time
// blocks the Vite SSR module runner because `routeTree.gen.ts` imports ALL
// route modules — including this one — for every page request.
//
// By deferring initialization to the first actual API request, we avoid
// blocking SSR of non-API routes (like `/`).
// ---------------------------------------------------------------------------

let effectHandler: ((ctx: { request: Request }) => Promise<Response>) | null =
  null;

const getHandler = async () => {
  if (effectHandler) {
    return effectHandler;
  }

  const { initApiHandler } = await import("./-lib/api-handler");
  const { handler, dispose } = await initApiHandler();

  effectHandler = ({ request }: { request: Request }) => handler(request);

  // HMR cleanup
  const globalHmr = globalThis as unknown as {
    __EFFECT_DISPOSE__?: () => Promise<void>;
  };

  // Dispose previous handler if HMR is active
  if (globalHmr.__EFFECT_DISPOSE__) {
    const prevDispose = globalHmr.__EFFECT_DISPOSE__;
    globalHmr.__EFFECT_DISPOSE__ = async () => {
      await prevDispose();
      await dispose();
    };
  } else {
    globalHmr.__EFFECT_DISPOSE__ = dispose;
  }

  return effectHandler;
};

const lazyHandler = async (ctx: { request: Request }) => {
  const handler = await getHandler();
  return handler(ctx);
};

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      DELETE: lazyHandler,
      GET: lazyHandler,
      OPTIONS: lazyHandler,
      PATCH: lazyHandler,
      POST: lazyHandler,
      PUT: lazyHandler,
    },
  },
});
