import { createCoreRuntime } from "@ringi/core/runtime";

/**
 * Shared server-side runtime instance.
 *
 * Extracted so that server functions in route modules can import this
 * lightweight module instead of `api/$.ts` — which pulls in the full
 * HTTP + RPC router graph and causes Vite worker OOM in dev.
 */
export const serverRuntime = createCoreRuntime();
