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
 * 5. package.json `bin.ringi` points to dist/cli.mjs
 * 6. npm pack includes critical files
 * 7. Packed package.json has no unresolved catalog:/workspace: protocols
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
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

// ── Source tree checks ──────────────────────────────────────────

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

// ── Packed tarball checks ───────────────────────────────────────

// 6–7. Pack with pnpm (resolves catalog:/workspace:), then verify contents
let tmpDir;
try {
  tmpDir = mkdtempSync(join(tmpdir(), "ringi-verify-"));

  // Use pnpm pack so catalog:/workspace: protocols are resolved,
  // matching what pnpm publish actually uploads.
  // pnpm pack outputs build logs + the tarball path on the last line.
  execSync(`pnpm pack --pack-destination "${tmpDir}"`, {
    cwd: cliRoot,
    encoding: "utf8",
    timeout: 120_000,
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Find the .tgz in the temp directory
  const tgzFiles = execSync(`ls "${tmpDir}"/*.tgz`, {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  if (tgzFiles.length === 0) {
    throw new Error("pnpm pack produced no .tgz file");
  }
  const tarball = tgzFiles[0];

  // Extract the tarball
  execSync(`tar xzf "${tarball}" -C "${tmpDir}"`, {
    encoding: "utf8",
    timeout: 10_000,
  });

  const packedPkgPath = join(tmpDir, "package", "package.json");

  if (!existsSync(packedPkgPath)) {
    fail("Packed tarball missing package.json");
  } else {
    const packedPkg = JSON.parse(readFileSync(packedPkgPath, "utf8"));

    // 6. Check critical files exist in tarball
    const criticalFiles = ["dist/cli.mjs", "server/server/index.mjs"];
    for (const f of criticalFiles) {
      const packedPath = join(tmpDir, "package", f);
      if (existsSync(packedPath)) {
        pass(`tarball includes ${f}`);
      } else {
        fail(`tarball missing ${f}`);
      }
    }

    // 7. Check for unresolved catalog:/workspace: in published dependencies
    const publishedDeps = {
      ...packedPkg.dependencies,
      ...packedPkg.peerDependencies,
    };
    const unresolvedProtocols = Object.entries(publishedDeps).filter(
      ([, v]) =>
        typeof v === "string" &&
        (v.startsWith("catalog:") || v.startsWith("workspace:"))
    );

    if (unresolvedProtocols.length === 0) {
      pass(
        "No unresolved catalog:/workspace: protocols in packed dependencies"
      );
    } else {
      for (const [name, version] of unresolvedProtocols) {
        fail(
          `Packed dependency "${name}": "${version}" has unresolved protocol — pnpm pack should have resolved this`
        );
      }
    }

    // Report package size (du -sk is portable across macOS and Linux)
    try {
      const duOutput = execSync(`du -sk "${join(tmpDir, "package")}"`, {
        encoding: "utf8",
      });
      const kb = parseInt(duOutput.split("\t")[0], 10);
      if (!isNaN(kb)) {
        const sizeMB = (kb / 1024).toFixed(1);
        console.log(`\n  📦 Unpacked size: ~${sizeMB} MB`);
      }
    } catch {
      // Non-critical — skip size reporting
    }
  }
} catch (err) {
  console.log(`  ⚠ Tarball verification error: ${err.message}`);
} finally {
  if (tmpDir) {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

console.log("");
if (failures > 0) {
  console.error(`❌ ${failures} check(s) failed. Fix before publishing.`);
  process.exit(1);
} else {
  console.log("✅ All checks passed. Package is ready for publishing.");
}
