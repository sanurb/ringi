# `find` Patterns for This Monorepo

Source files live under `apps/` and `packages/`. Heavy directories that must be
pruned: `node_modules` (~800 MB), `server` (CLI build output), `.output`,
`.tanstack`, `.vinxi`, `dist`, `coverage`, `.git`, `.cache`.

The repo has ~150 source files. A well-pruned `find` returns instantly.
An unpruned one walks 800 MB+ of dependencies.

---

## 1. Fast Base Pattern

Every command starts from this skeleton. **Prune first, match second.**

```bash
find apps packages \
  -type d \( -name node_modules -o -name dist -o -name server -o -name .output -o -name .vinxi -o -name .tanstack -o -name coverage -o -name .cache \) -prune \
  -o -type f <CONDITIONS> -print
```

The `-prune` group short-circuits traversal of heavy subtrees before any file
matching happens. This is the single biggest performance lever.

> **fish note:** No escaping issues here — parentheses are already
> backslash-escaped. This works in bash, zsh, and fish identically.

---

## 2. Best-Practice Commands

### Find all TS/TSX source files (excluding tests)

```bash
find apps packages \
  -type d \( -name node_modules -o -name dist -o -name server -o -name .output -o -name .vinxi -o -name .tanstack -o -name coverage \) -prune \
  -o -type f \( -name '*.ts' -o -name '*.tsx' \) ! -name '*.test.*' ! -name '*.spec.*' -print
```

Why fast: prunes all build/dep dirs, matches only by extension, excludes tests
at the filename level without scanning contents.

### Find test files

```bash
find apps packages \
  -type d \( -name node_modules -o -name dist -o -name server -o -name .output \) -prune \
  -o -type f \( -name '*.test.ts' -o -name '*.test.tsx' -o -name '*.spec.ts' \) -print
```

### Find `package.json` (workspace metadata)

```bash
find apps packages -maxdepth 2 -name 'package.json' -type f
```

Why fast: `maxdepth 2` hits `apps/web/package.json` and
`packages/core/package.json` without recursing deeper. No prune needed — depth
limit is cheaper here.

### Find `tsconfig*.json`

```bash
find apps packages -maxdepth 2 -name 'tsconfig*.json' -type f
```

### Find likely entrypoints

```bash
find apps packages \
  -type d \( -name node_modules -o -name dist -o -name server -o -name .output \) -prune \
  -o -type f \( -name 'index.ts' -o -name 'main.ts' -o -name 'cli.ts' -o -name 'runtime.ts' \) -print
```

### Find files by partial name

```bash
find apps packages \
  -type d \( -name node_modules -o -name dist -o -name server -o -name .output \) -prune \
  -o -type f -name '*review*' -print
```

### Find workspace folders (immediate children)

```bash
find apps packages -mindepth 1 -maxdepth 1 -type d
```

Returns: `apps/cli`, `apps/web`, `packages/core`. Instant — no recursion.

### Find recently modified files (last 30 min)

```bash
find apps packages \
  -type d \( -name node_modules -o -name dist -o -name server -o -name .output \) -prune \
  -o -type f -name '*.ts' -mmin -30 -print
```

### Find all CSS/style files

```bash
find apps packages \
  -type d \( -name node_modules -o -name dist -o -name server -o -name .output \) -prune \
  -o -type f \( -name '*.css' -o -name '*.pcss' \) -print
```

---

## 3. Good Examples

```bash
# ✅ Prune BEFORE match — heavy dirs never entered
find apps packages -type d -name node_modules -prune -o -type f -name '*.ts' -print

# ✅ Depth-limited for metadata files — no prune needed
find apps packages -maxdepth 2 -name 'package.json'

# ✅ Multiple search roots, single command
find apps/web/src packages/core/src -type f -name '*.ts'
```

## 4. Bad Examples

```bash
# ❌ No prune — walks 800 MB of node_modules
find apps packages -name '*.ts'

# ❌ Prune AFTER match — node_modules is already traversed
find apps packages -type f -name '*.ts' -not -path '*/node_modules/*'
#   ^ This visits every file in node_modules, then filters. Extremely slow.

# ❌ Starting from repo root without prune
find . -name '*.ts'
#   ^ Walks root node_modules (722 MB) + all build dirs.

# ❌ Using grep -r without exclusion
grep -r 'Effect.gen' apps packages
#   ^ Scans node_modules contents. Use grep with --exclude-dir instead,
#     or better: use the pi `grep` tool which respects .gitignore.

# ❌ -regex when -name suffices — regex matching is slower per inode
find apps packages -regex '.*\.test\.ts$'
```

---

## 5. Performance Rules of Thumb

1. **Prune first.** `-type d -name X -prune` prevents `stat()` on every file
   under X. `-not -path` does not — it still descends and checks every entry.
2. **Narrow the search root.** `find apps/web/src` beats `find apps` when you
   know the workspace.
3. **Use `-maxdepth`** for shallow metadata queries (`package.json`,
   `tsconfig.json`). Avoids the prune boilerplate entirely.
4. **`-type f` early** reduces directory `stat()` overhead.
5. **`-name` over `-regex`** — glob matching is cheaper and simpler.
6. **Combine roots:** `find apps packages` is one traversal, two
   `find` commands is two.

---

## 6. When to Use `fd` Instead

`fd` (installed at `/opt/homebrew/bin/fd`) is better when:

| Scenario                  | Why `fd` wins                                                   |
| ------------------------- | --------------------------------------------------------------- |
| Quick interactive lookups | Respects `.gitignore` by default — no prune boilerplate         |
| Fuzzy/regex name search   | `fd review` finds all files with "review" in the path           |
| Colored terminal output   | Easier to scan visually                                         |
| Default sane behavior     | Ignores hidden dirs, `node_modules`, build output automatically |

```bash
# Equivalent to the full pruned find, but shorter:
fd -e ts -e tsx apps packages

# Find test files
fd '.test.ts$' apps packages

# Find by partial name
fd review apps packages
```

**Use `find` when:** you need `-mmin`, `-newer`, `-size`, `-exec`, `-maxdepth`
with precise semantics, or scripting where POSIX portability matters.

**Use `fd` when:** you want fast interactive lookups with sane defaults and no
prune ceremony.

**Use pi's `grep`/`find` tools when:** you're inside an agent session — they
use frecency ranking, respect `.gitignore`, and are the fastest option available.
