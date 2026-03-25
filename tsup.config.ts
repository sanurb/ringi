import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { defineConfig } from "tsup";

/**
 * Post-build: restore `node:` prefix for bare builtins that esbuild strips.
 * Necessary because `node:sqlite` (≥22.5) has no un-prefixed equivalent.
 */
const BUILTINS_NEEDING_PREFIX = [
  "assert",
  "buffer",
  "child_process",
  "crypto",
  "events",
  "fs",
  "http",
  "https",
  "module",
  "net",
  "os",
  "path",
  "process",
  "querystring",
  "readline",
  "sqlite",
  "stream",
  "string_decoder",
  "timers",
  "tls",
  "url",
  "util",
  "vm",
  "worker_threads",
  "zlib",
];

function restoreNodePrefix(outDir: string) {
  // Matches both `from 'fs'` and `from 'fs/promises'` etc.
  const pattern = new RegExp(
    `from '(${BUILTINS_NEEDING_PREFIX.join("|")})(/?[^']*)'`,
    "g"
  );
  for (const file of readdirSync(outDir)) {
    if (!file.endsWith(".js")) {
      continue;
    }
    const filepath = join(outDir, file);
    const content = readFileSync(filepath, "utf8");
    const fixed = content.replace(pattern, "from 'node:$1$2'");
    if (fixed !== content) {
      writeFileSync(filepath, fixed);
    }
  }
}

export default defineConfig([
  {
    entry: {
      cli: "src/cli/main.ts",
      mcp: "src/mcp/server.ts",
    },
    outDir: "dist",
    format: ["esm"],
    target: "node22",
    platform: "node",
    splitting: true,
    treeshake: true,
    clean: true,
    sourcemap: true,
    // Keep effect ecosystem external (installed as dependencies)
    external: [/^effect/, /^@effect/],
    noExternal: [/@\//, /^@pierre/],
    esbuildOptions(options) {
      options.alias = { "@": "./src" };
      // Inject version at build time so it's available without npm_package_version
      options.define = {
        ...options.define,
        "process.env.RINGI_VERSION": JSON.stringify(
          process.env.npm_package_version || "0.0.0-dev"
        ),
      };
    },
    onSuccess: async () => {
      restoreNodePrefix("dist");
    },
  },
]);
