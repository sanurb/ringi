import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@ringi/core": resolve(import.meta.dirname!, "src"),
    },
  },
  test: {
    name: "@ringi/core",
    include: ["src/**/*.test.ts"],
  },
});
