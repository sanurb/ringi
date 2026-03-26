import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import babel from "@rolldown/plugin-babel";

const config = defineConfig({
  resolve: {
    // Vite 8 built-in tsconfig paths — replaces vite-tsconfig-paths plugin.
    tsconfigPaths: true,
    // Ensure workspace-linked packages resolve to a single module instance.
    // Without this, Vite may evaluate @ringi/core modules multiple times when
    // reached through different dependency paths (e.g. server-runtime vs
    // client-runtime), doubling memory usage in the SSR module runner.
    dedupe: ["effect", "@effect/platform", "@effect/rpc", "@ringi/core"],
  },
  ssr: {
    // Workspace packages with .ts source exports must NOT be externalized
    // — Node can't import .ts files directly.
    noExternal: ["@ringi/core"],
  },
  plugins: [
    devtools(),
    tanstackStart(),
    // https://tanstack.com/start/latest/docs/framework/react/guide/hosting
    nitro({
      devServer: {
        // Default "node-worker" spawns a Worker thread with limited heap.
        // Effect + all core services exceed that limit, causing OOM.
        // "node-process" uses fork() which inherits NODE_OPTIONS (--max-old-space-size).
        runner: "node-process",
      },
    }),
    viteReact(),
    babel({
      presets: [reactCompilerPreset()],
    }),
    tailwindcss(),
  ],
  server: {
    port: 3000,
  },
  optimizeDeps: {
    // Pre-bundle heavy deps so Vite workers don't re-parse them each time
    include: ["effect", "@effect/platform", "shiki", "react", "react-dom"],
  },
});

export default config;
