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
if npm view "@ringi/cli@${VERSION}" version &>/dev/null 2>&1; then
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
CLI_VERSION=$(node apps/cli/dist/cli.js --version 2>&1)
if [[ "$CLI_VERSION" != *"$VERSION"* ]] && [[ "$CLI_VERSION" != "0.0.0-dev" ]]; then
  warn "CLI reports version '${CLI_VERSION}', expected '${VERSION}'"
fi
node apps/cli/dist/cli.js --help >/dev/null || fail "CLI --help failed"
ok "CLI smoke test passed (version: ${CLI_VERSION})"

# ── Step 4: Package inspection ───────────────────────────────────────────

echo ""
info "Packing dry-run..."
cd apps/cli && npm pack --dry-run 2>&1
echo ""

# Show tarball size
TARBALL=$(cd apps/cli && npm pack 2>/dev/null)
TARBALL_SIZE=$(du -h "$TARBALL" | cut -f1)
info "Tarball: ${TARBALL} (${TARBALL_SIZE})"
rm -f "$TARBALL"
ok "Package looks good"

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
  echo "    cd apps/cli && npm publish --access public"
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
cd apps/cli && npm publish --access public
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
