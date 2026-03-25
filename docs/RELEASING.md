# Releasing ringi

## Prerequisites (one-time setup)

1. **npm account**: Create at [npmjs.com](https://www.npmjs.com/signup)
2. **npm login**: Run `npm login` and authenticate
3. **2FA**: Enable 2FA on your npm account (recommended: "auth and writes")
4. **GitHub secret** (for CI publish): Add `NPM_TOKEN` to repo Settings → Secrets → Actions
   - Generate at npmjs.com → Access Tokens → Generate New Token → Granular Access Token
   - Scope: `ringi` package, Read and Write

## Version Strategy

Ringi follows [Semantic Versioning](https://semver.org/):

- `0.x.y` — Pre-1.0: breaking changes in minor bumps are expected
- Bump **patch** for bug fixes: `npm version patch`
- Bump **minor** for features or breaking changes (pre-1.0): `npm version minor`
- Bump **major** at 1.0 when API stabilizes

## Release Checklist

```
[ ] 1. Ensure you're on `main` with a clean working tree
[ ] 2. Run preflight: ./scripts/release.sh
[ ] 3. Bump version: npm version patch|minor|major
[ ] 4. Publish: ./scripts/release.sh --publish
[ ] 5. Verify: npx ringi@latest --version
[ ] 6. Create GitHub release with changelog at releases/new
```

## Detailed Steps

### 1. Preflight (validates everything, does NOT publish)

```bash
./scripts/release.sh
```

This runs: typecheck → lint → test → build → smoke test → pack dry-run.

### 2. Bump Version

```bash
# For a patch release (0.1.0 → 0.1.1)
npm version patch

# For a minor release (0.1.0 → 0.2.0)
npm version minor

# For a pre-release
npm version prerelease --preid=rc
```

`npm version` updates `package.json`, commits, and creates a git tag automatically.

### 3. Publish

```bash
# Interactive publish with confirmation prompt
./scripts/release.sh --publish
```

Or manually:

```bash
# Final dry-run
npm publish --dry-run --access public

# Actual publish (will prompt for OTP if 2FA enabled)
npm publish --access public

# Push the tag
git push origin main --tags
```

### 4. Verify

```bash
npx ringi@latest --version
npm info ringi
```

## Why `--access public`?

`ringi` is an unscoped package name (not `@scope/ringi`). npm defaults unscoped
packages to public, but `--access public` makes the intent explicit and prevents
accidental private publishes if npm config changes.

## CI Publishing (GitHub Actions)

The `release.yml` workflow:

1. **On tag push** (`v*`): Runs full validation → publishes with npm provenance
2. **Manual dispatch**: Runs validation only (dry-run mode)

For CI to publish, the `NPM_TOKEN` secret must be configured. The workflow uses
`--provenance` to cryptographically attest that the package was built from this
repository via GitHub Actions.

## Troubleshooting

### "Version already published"

npm does not allow republishing the same version. Bump the version and try again.

### "npm ERR! 403 Forbidden"

Your npm token may lack publish permissions, or 2FA OTP may be required.
Run `npm login` again or pass `--otp=<code>`.

### CLI shows wrong version

Run `pnpm build:cli` to rebuild. The version is baked in at build time from
`package.json`. The `prepack` script handles this automatically during `npm publish`.
