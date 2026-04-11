#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────
# ringi release script — human-in-the-loop npm publish workflow
#
# Usage:
#   ./scripts/release.sh              # Preflight only (no publish)
#   ./scripts/release.sh --publish    # Preflight + publish to npm
#
# Prerequisites:
#   1. npm login (run `npm login` if not authenticated)
#   2. 2FA/OTP ready if your npm account requires it
#   3. Clean git working tree on main branch
# ──────────────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}ℹ${NC}  $*"; }
ok()    { echo -e "${GREEN}✔${NC}  $*"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $*"; }
fail()  { echo -e "${RED}✘${NC}  $*"; exit 1; }

PUBLISH=false
if [[ "${1:-}" == "--publish" ]]; then
  PUBLISH=true
fi

echo ""
echo "═══════════════════════════════════════════════"
echo "  ringi release preflight"
echo "═══════════════════════════════════════════════"
echo ""

# ── Step 1: Environment checks ──────────────────────────────────────────

VERSION=$(node -p "require('./apps/cli/package.json').version")
info "Package version: ${VERSION}"

# Check we're on main
BRANCH=$(git branch --show-current)
if [[ "$BRANCH" != "main" ]]; then
  fail "Must be on 'main' branch (currently on '${BRANCH}')"
fi
ok "On main branch"

# Check clean working tree
if ! git diff --quiet HEAD; then
  fail "Working tree is dirty. Commit or stash changes first."
fi
ok "Clean working tree"

# Check npm auth
if ! npm whoami &>/dev/null; then
  fail "Not logged in to npm. Run: npm login"
fi
NPM_USER=$(npm whoami)
ok "Logged in to npm as: ${NPM_USER}"

# Check if version already published
if npm view "@sanurb/ringi@${VERSION}" version &>/dev/null 2>&1; then
  fail "Version ${VERSION} already published on npm. Bump version first."
fi
ok "Version ${VERSION} not yet published"

# ── Step 2: Full validation ──────────────────────────────────────────────

echo ""
info "Running typecheck..."
pnpm typecheck || fail "Typecheck failed"
ok "Typecheck passed"

info "Running lint & format check..."
pnpm check || fail "Lint/format check failed"
ok "Lint & format passed"

info "Running tests..."
pnpm test || fail "Tests failed"
ok "Tests passed"

# ── Step 3: Build ────────────────────────────────────────────────────────

echo ""
info "Building CLI..."
pnpm build:cli || fail "CLI build failed"
ok "CLI built"

info "Smoke testing CLI..."
CLI_VERSION=$(node apps/cli/dist/cli.mjs --version 2>&1)
if [[ "$CLI_VERSION" != *"$VERSION"* ]] && [[ "$CLI_VERSION" != "0.0.0-dev" ]]; then
  warn "CLI reports version '${CLI_VERSION}', expected '${VERSION}'"
fi
node apps/cli/dist/cli.mjs --help >/dev/null || fail "CLI --help failed"
ok "CLI smoke test passed (version: ${CLI_VERSION})"

# ── Step 4: Package inspection ───────────────────────────────────────────

echo ""
info "Packing dry-run..."
# MUST be `pnpm pack`, not `npm pack`. The workspace uses pnpm `catalog:`
# protocol references in dependencies; only `pnpm pack` resolves them to real
# semver specifiers before writing the tarball. `npm pack` would copy them
# verbatim, producing a tarball that fails on `npm install` with
# EUNSUPPORTEDPROTOCOL — exactly the kind of regression this preflight catches.
(cd apps/cli && pnpm pack --dry-run 2>&1)
echo ""

# Pack a real tarball and verify a npm consumer can install AND run it.
# Validates the locally-built dist AND the resolved transitive dependency tree.
# Releases used to ship pinned `effect@4.0.0-beta.41` direct deps but let npm hoist
# `@effect/platform-node-shared@4.0.0-beta.46`, dragging `effect@4.0.0-beta.46` (which
# removed `dist/ServiceMap.js`) on top of `@effect/platform-node@4.0.0-beta.41`'s import.
# Local `node dist/cli.mjs` never caught it. The install-and-run test below does.
TARBALL=$(cd apps/cli && pnpm pack 2>/dev/null | tail -1)
TARBALL_PATH="$(cd apps/cli && pwd)/$TARBALL"
TARBALL_SIZE=$(du -h "$TARBALL_PATH" | cut -f1)
info "Tarball: ${TARBALL} (${TARBALL_SIZE})"

info "Installing packed tarball as a real npm consumer..."
INSTALL_DIR=$(mktemp -d)
cleanup_install() { rm -rf "$INSTALL_DIR" "$TARBALL_PATH"; }
trap cleanup_install EXIT
(
  cd "$INSTALL_DIR"
  npm init -y >/dev/null
  npm install --silent "$TARBALL_PATH" >/dev/null 2>&1 || { echo "npm install of tarball failed"; exit 1; }
  INSTALLED_VERSION=$(./node_modules/.bin/ringi --version 2>&1)
  if [[ "$INSTALLED_VERSION" != *"$VERSION"* ]]; then
    echo "Installed CLI reports '${INSTALLED_VERSION}', expected to contain '${VERSION}'"
    exit 1
  fi
  ./node_modules/.bin/ringi --help >/dev/null || { echo "Installed CLI --help failed"; exit 1; }
) || fail "Packed tarball failed to install or run as a npm consumer"
ok "Packed tarball installs and runs cleanly (version: ${VERSION})"

# ── Step 5: Publish gate ─────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════"

if [[ "$PUBLISH" != true ]]; then
  echo ""
  ok "Preflight complete. Ready to publish."
  echo ""
  echo "  To publish:"
  echo "    ./scripts/release.sh --publish"
  echo ""
  echo "  Or manually:"
  echo "    pnpm --filter @sanurb/ringi publish --access public --no-git-checks"
  echo ""
  echo "  Then tag:"
  echo "    git tag v${VERSION}"
  echo "    git push origin v${VERSION}"
  echo ""
  exit 0
fi

echo ""
warn "About to publish ringi@${VERSION} to npm"
echo ""
echo "  Package:  ringi"
echo "  Version:  ${VERSION}"
echo "  Access:   public"
echo "  User:     ${NPM_USER}"
echo ""
read -r -p "  Type 'yes' to confirm publish: " CONFIRM
if [[ "$CONFIRM" != "yes" ]]; then
  fail "Publish cancelled."
fi

echo ""
info "Publishing..."
pnpm --filter @sanurb/ringi publish --access public --no-git-checks
ok "Published ringi@${VERSION} to npm!"

echo ""
info "Creating git tag..."
git tag "v${VERSION}"
git push origin "v${VERSION}"
ok "Pushed tag v${VERSION}"

echo ""
echo "═══════════════════════════════════════════════"
echo "  🎉 ringi@${VERSION} is live on npm!"
echo "═══════════════════════════════════════════════"
echo ""
echo "  Install: npm i -g ringi"
echo "  Verify:  npx ringi --version"
echo ""
