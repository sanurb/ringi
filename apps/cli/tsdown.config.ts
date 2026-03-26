import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    cli: "src/cli/main.ts",
    mcp: "src/mcp/server.ts",
  },
  outDir: "dist",
  format: "esm",
  fixedExtension: true,
  sourcemap: true,
  hash: false,

  // Source already uses node: prefix consistently — keep as-is
  nodeProtocol: false,

  alias: { "@": "./src" },

  define: {
    "process.env.RINGI_VERSION": JSON.stringify(
      process.env.npm_package_version || "0.0.0-dev"
    ),
  },

  deps: {
    // Keep effect ecosystem external (installed as dependencies)
    neverBundle: [/^effect/, /^@effect/],
    // Bundle workspace and internal packages
    alwaysBundle: [/@\//, /^@pierre/, /^@ringi\/core/],
  },
});
