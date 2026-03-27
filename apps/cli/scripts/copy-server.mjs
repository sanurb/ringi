#!/usr/bin/env node

/**
 * Copies the built Nitro server output from apps/web/.output into apps/cli/server/
 * so the published npm package includes the server assets needed by `ringi serve`.
 *
 * This script is called by `pnpm build:server` and `prepack`.
 * It must run AFTER the web app has been built (`pnpm build` at the root).
 */

import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(__dirname, "..");
const webOutput = resolve(cliRoot, "..", "..", "apps", "web", ".output");
const target = resolve(cliRoot, "server");

if (!existsSync(webOutput)) {
  // In CI the web build runs before the CLI pack. For local dev, this is fine
  // to skip — the CLI will fall back to cwd-relative lookup.
  console.warn(
    `⚠ Web build output not found at ${webOutput}. Skipping server copy.`
  );
  console.warn(
    "  Run 'pnpm build' at the monorepo root first to build the web app."
  );
  process.exit(0);
}

const serverSrc = resolve(webOutput, "server");
const publicSrc = resolve(webOutput, "public");

if (!existsSync(resolve(serverSrc, "index.mjs"))) {
  console.error(
    `✗ Expected ${serverSrc}/index.mjs not found. Web build may be incomplete.`
  );
  process.exit(1);
}

// Clean previous copy
if (existsSync(target)) {
  rmSync(target, { recursive: true, force: true });
}
mkdirSync(target, { recursive: true });

// Copy server runtime files
cpSync(serverSrc, resolve(target, "server"), { recursive: true });

// Copy public assets (static files served by the Nitro server)
if (existsSync(publicSrc)) {
  cpSync(publicSrc, resolve(target, "public"), { recursive: true });
}

// Copy nitro.json metadata
const nitroJson = resolve(webOutput, "nitro.json");
if (existsSync(nitroJson)) {
  cpSync(nitroJson, resolve(target, "nitro.json"));
}

console.log(`✓ Server assets copied to ${target}`);
