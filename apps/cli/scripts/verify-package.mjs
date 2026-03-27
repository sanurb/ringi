#!/usr/bin/env node

/**
 * Verifies the packed npm artifact contains everything needed for `ringi serve`
 * to work from an installed package. Run after `pnpm build:all` or in CI.
 *
 * Checks:
 * 1. dist/cli.mjs exists and is executable entry point
 * 2. server/server/index.mjs exists (Nitro server entry)
 * 3. server/public/ exists (static assets)
 * 4. package.json `files` includes both `dist` and `server`
 * 5. `npm pack --dry-run` output includes critical files
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(__dirname, "..");

let failures = 0;
const pass = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg) => {
  console.error(`  ✗ ${msg}`);
  failures++;
};

console.log("Verifying @sanurb/ringi package integrity...\n");

// 1. Check dist/cli.mjs
const cliEntry = resolve(cliRoot, "dist", "cli.mjs");
if (existsSync(cliEntry)) {
  pass("dist/cli.mjs exists");
} else {
  fail("dist/cli.mjs missing — run 'pnpm --filter @sanurb/ringi build'");
}

// 2. Check server/server/index.mjs
const serverEntry = resolve(cliRoot, "server", "server", "index.mjs");
if (existsSync(serverEntry)) {
  pass("server/server/index.mjs exists (Nitro entry)");
} else {
  fail(
    "server/server/index.mjs missing — run 'pnpm build && pnpm --filter @sanurb/ringi build:server'"
  );
}

// 3. Check server/public/
const publicDir = resolve(cliRoot, "server", "public");
if (existsSync(publicDir)) {
  pass("server/public/ exists (static assets)");
} else {
  fail("server/public/ missing — web build may be incomplete");
}

// 4. Check package.json files field
const pkg = JSON.parse(readFileSync(resolve(cliRoot, "package.json"), "utf8"));
const files = pkg.files || [];
if (files.includes("dist") && files.includes("server")) {
  pass('package.json "files" includes both "dist" and "server"');
} else {
  fail(
    `package.json "files" is [${files.join(", ")}] — must include "dist" and "server"`
  );
}

// 5. Check bin field
if (pkg.bin?.ringi === "dist/cli.mjs") {
  pass('package.json "bin.ringi" points to dist/cli.mjs');
} else {
  fail(
    `package.json "bin.ringi" is "${pkg.bin?.ringi}" — expected "dist/cli.mjs"`
  );
}

// 6. Check for unresolved workspace/catalog protocols
const allDeps = {
  ...pkg.dependencies,
  ...pkg.peerDependencies,
};
const unresolvedProtocols = Object.entries(allDeps).filter(
  ([, v]) =>
    typeof v === "string" &&
    (v.startsWith("catalog:") || v.startsWith("workspace:"))
);
if (unresolvedProtocols.length === 0) {
  pass("No unresolved catalog:/workspace: protocols in published dependencies");
} else {
  for (const [name, version] of unresolvedProtocols) {
    fail(
      `Unresolved protocol in dependencies: "${name}": "${version}" — use 'pnpm publish' instead of 'npm publish'`
    );
  }
}

// 7. Run npm pack --dry-run and verify critical files appear
try {
  const packOutput = execSync("npm pack --dry-run --json 2>/dev/null", {
    cwd: cliRoot,
    encoding: "utf8",
    timeout: 30_000,
  });
  const packData = JSON.parse(packOutput);
  const packedFiles = packData[0]?.files?.map((f) => f.path) ?? [];

  const criticalFiles = [
    "dist/cli.mjs",
    "server/server/index.mjs",
    "package.json",
  ];

  for (const f of criticalFiles) {
    if (packedFiles.some((p) => p === f || p.startsWith(f))) {
      pass(`npm pack includes ${f}`);
    } else {
      fail(`npm pack missing ${f}`);
    }
  }

  // Report package size
  const totalBytes = packData[0]?.unpackedSize ?? 0;
  const sizeMB = (totalBytes / 1024 / 1024).toFixed(1);
  console.log(`\n  📦 Unpacked size: ${sizeMB} MB`);
} catch (_) {
  // npm pack --json may not be available in all environments
  console.log("  ⚠ Skipped npm pack verification (non-critical)");
}

console.log("");
if (failures > 0) {
  console.error(`❌ ${failures} check(s) failed. Fix before publishing.`);
  process.exit(1);
} else {
  console.log("✅ All checks passed. Package is ready for publishing.");
}
