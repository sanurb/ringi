import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    projects: ["apps/cli", "apps/web", "packages/core"],
  },

  // vp staged — replaces lefthook pre-commit
  staged: {
    "*.{js,jsx,ts,tsx,json,jsonc,css}": "vp check --fix",
  },
});
