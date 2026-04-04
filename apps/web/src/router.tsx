import { createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";

/**
 * Default loading fallback — a minimal full-height pulsing bar.
 * Individual routes override this with layout-matched skeletons.
 */
function DefaultPendingComponent() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-1 w-24 animate-skeleton-pulse rounded-full bg-surface-overlay/60" />
    </div>
  );
}

export const getRouter = () => {
  const router = createRouter({
    defaultPreloadStaleTime: 0,
    // Show skeleton after 150ms to avoid flash on fast loads.
    // Keep it visible for at least 200ms to prevent flicker.
    defaultPendingMs: 150,
    defaultPendingMinMs: 200,
    defaultPendingComponent: DefaultPendingComponent,
    routeTree,
    scrollRestoration: true,
  });

  return router;
};
