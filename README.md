# Ringi

**Local-first code review tool for AI-generated changes**

Ringi provides structured code review workflows that work locally. Create review sessions from git diffs, inspect changes with machine-generated provenance and evidence, understand first-order impact, and access the same review state through Web UI, CLI, and MCP integration.

---

## Overview

Browser-based review tools disconnect you from your local development environment and lack structured intelligence for AI-generated changes. AI agents produce diffs faster than humans can review them, but existing tools don't systematically show what changed, why it changed, or what else might be affected.

Ringi anchors review work in immutable review sessions stored locally. Each session captures a snapshot of staged changes, branch divergence, or commit range, then adds:

- **Structured provenance** explaining why each file changed
- **Review-scoped impact analysis** showing first-order effects without repository-wide exploration
- **Evidence-backed confidence scoring** to prioritize reviewer attention
- **Grouped file navigation** organizing changes by logical relationship
- **Persistent annotations** including comments, suggestions, and operational todos
- **Export artifacts** for downstream workflows and audit trails

Review state lives locally in SQLite with no network dependency for core workflows. The same review session model works across three surfaces: web interface, CLI, and MCP protocol.

---

## Key Features

### **Review Sessions**

Create bounded review contexts from `staged` changes, `branch` divergence, or explicit `commit` ranges. Each session captures an immutable diff snapshot that stays consistent for analysis, annotation, and export.

### **Review-Scoped Intelligence**

- **Provenance tracking**: Structured explanations of why files changed
- **Impact analysis**: First-order effects and uncovered dependents
- **Confidence scoring**: Evidence-backed priority guidance for reviewer attention
- **Grouped file tree**: Logical organization by directory and import relationships

### **Review Interface**

- **Syntax-highlighted diffs** with lazy loading for large reviews
- **Inline comments and suggestions** with resolution tracking
- **Todo management** linked to review sessions
- **Live filesystem watching** with SSE updates across all surfaces

### **Agent Integration**

- **MCP protocol** exposes review operations through structured namespaces
- **Codemode execution** allows complex multi-step workflows in one call
- **Read-only and mutation modes** for safe inspection vs. active collaboration
- **Self-verification APIs** for deterministic review validation

### **Local-First Architecture**

- **SQLite storage** in `.ringi/reviews.db` - no cloud dependencies
- **Offline operation** for all read-heavy workflows
- **Predictable performance** bounded to review scope, not repository size
- **Crash-safe persistence** with WAL mode and foreign key constraints

---

## Installation

```bash
# Install via pnpm (recommended)
pnpm install -g ringi

# Or via npm
npm install -g ringi

# Or via bun
bun install -g ringi
```

### Development Setup

```bash
# Clone the repository
git clone https://github.com/sanurb/ringi.git
cd ringi

# Install dependencies
pnpm install

# Initialize local development database
pnpm dev  # Starts TanStack dev server with hot reload

# Or start production server
pnpm build
ringi serve --port 3000
```

---

## Quick Start

### 1. Create Your First Review Session

```bash
# Review staged changes (most common)
ringi review create

# Review branch divergence
ringi review create --source branch --branch feature/ai-review-pipeline

# Review specific commits
ringi review create --source commits --commits abc123f,def456a --title "Agent refactor batch"
```

### 2. Inspect and Navigate

```bash
# List all reviews
ringi review list

# Show detailed review with files and stats
ringi review show last --comments --todos

# Preview available sources before creating
ringi source list
ringi source diff staged --stat
```

### 3. Add Annotations and Track Work

```bash
# Add operational todos
ringi todo add --text "Verify confidence scores on grouped file tree" --review rvw_01JY6Z4Y9B

# Mark todos complete
ringi todo done todo_01JY702YJ0D3

# Export review session as markdown
ringi review export last --output review-summary.md
```

### 4. Launch Web Interface

```bash
# Start local server with web UI
ringi serve

# With HTTPS and basic auth for network access
ringi serve --https --cert ./certs/dev.crt --key ./certs/dev.key --auth --username reviewer --password secure
```

---

## Core Workflows

### Web Interface Overview

The web interface provides structured diff review:

- **Review dashboard** with session management and status tracking
- **Grouped file navigation** showing logical change clusters
- **Diff viewer** with syntax highlighting and context controls
- **Impact visualization** showing dependencies and coverage gaps
- **Comment threads** with suggestion extraction and resolution tracking
- **Todo panel** for operational follow-up items
- **Export generation** with markdown and structured output formats

_Screenshots coming in Phase 1.5_

### CLI Workflow

Complete review workflows from the terminal:

```bash
# Complete review workflow from terminal
ringi review create --source staged
ringi review show last --comments
ringi todo add --text "Check impact on auth service" --review last
ringi review export last | pbcopy  # macOS clipboard
ringi review resolve last --yes
```

**Command families:**

- `ringi review` - Create, list, show, export, resolve review sessions
- `ringi todo` - Manage operational tasks linked to reviews
- `ringi source` - Preview and discover available diff sources
- `ringi data` - Migrate, reset, and maintain local state
- `ringi serve` - Start web server and runtime coordination
- `ringi events` - Tail live filesystem and review events
- `ringi mcp` - Launch agent integration server

### Agent Integration via MCP

Agents connect through `ringi mcp` stdio protocol:

```javascript
// Agent workflow example
await execute({
  code: `
    const ctx = await session.context();
    const review = await reviews.get(ctx.activeReviewId);
    const files = await reviews.getFiles(review.id);
    
    // Inspect high-risk changes
    const riskyFiles = files.filter(file => 
      file.confidence?.score < 0.6
    );
    
    if (riskyFiles.length > 0) {
      await todos.add({
        reviewId: review.id,
        text: \`Review \${riskyFiles.length} low-confidence files before approval\`
      });
    }
    
    return {
      reviewId: review.id,
      totalFiles: files.length,
      riskyFiles: riskyFiles.map(f => f.path)
    };
  `,
  timeout: 30000,
});
```

**Available MCP namespaces:**

- `reviews` - Session lifecycle, diff access, comment management
- `intelligence` - Relationships, impact analysis, confidence scoring
- `todos` - Task management and workflow coordination
- `sources` - Repository state and diff preview
- `events` - Real-time change notifications
- `session` - Context and adapter status

---

## Local-First Data Model

Ringi's architecture prioritizes local operation and data ownership:

### Storage Architecture

- **SQLite database** at `.ringi/reviews.db` stores all review state
- **WAL mode** enables concurrent reads with serialized writes
- **Schema migrations** handle evolution without data loss
- **Foreign key constraints** ensure referential integrity

### Operational Modes

| Mode                 | Description                                 | Use Cases                                      |
| -------------------- | ------------------------------------------- | ---------------------------------------------- |
| **Standalone**       | Direct SQLite access, no server required    | CLI inspection, export generation, diagnostics |
| **Server-connected** | Coordinated mutations via local HTTP server | Web UI, live updates, complex workflows        |
| **MCP stdio**        | Agent integration over process boundaries   | AI review automation, validation pipelines     |

### Data Portability

- Review snapshots remain immutable and reproducible
- Export artifacts can recreate review state from structured data
- Migration tools support repository changes and schema evolution
- Diagnostic commands validate state integrity and recover from corruption

---

## Technology Stack

**Runtime & Framework**

- [TanStack Start](https://tanstack.com/start) for route-driven application composition
- [Effect](https://effect.website) for service construction and dependency injection
- [React 19](https://react.dev) for UI components

**Storage & Persistence**

- [SQLite](https://sqlite.org) with WAL mode for local-first data
- [Chokidar](https://github.com/paulmillr/chokidar) for filesystem watching
- Typed schema migrations with foreign key enforcement

**UI & Styling**

- [Tailwind CSS 4](https://tailwindcss.com) with cascade layers
- [Radix UI](https://radix-ui.com) for accessible components
- [Shiki](https://shiki.style) for syntax highlighting
- [Lucide Icons](https://lucide.dev) for iconography

**Development & Quality**

- [TypeScript](https://typescriptlang.org) with strict type checking
- [Vitest](https://vitest.dev) for testing (no mocking frameworks)
- [Ultracite](https://github.com/your-org/ultracite) for linting and formatting
- [Effect Language Service](https://effect.website) for IDE support

---

## Development

### Requirements

- **Node.js** 18+ or **Bun** 1.0+
- **pnpm** 8+ (recommended) or npm/bun
- **Git** for repository operations
- **SQLite** 3.38+ (bundled with Node.js)

### Project Structure

```
ringi/
├── src/
│   ├── routes/           # TanStack Start routes & API handlers
│   ├── cli/              # CLI implementation and commands
│   └── components/       # React UI components
├── docs/                 # Architecture and API documentation
├── .ringi/               # Local review database (created on first run)
└── package.json          # Dependencies and scripts
```

### Quality Gates

All contributions must pass:

```bash
pnpm check      # Ultracite linting
pnpm fix        # Auto-fix formatting issues
pnpm typecheck  # TypeScript validation
pnpm test       # Test suite (no mocks allowed)
```

### Contributing

1. Fork the repository and create a feature branch
2. Run `pnpm install` and ensure quality gates pass
3. Follow the no-mocking testing policy - use dependency injection
4. Add tests for new functionality using constructor injection patterns
5. Submit pull request with clear description and examples

---

## Roadmap

### Phase 1: Operational Surface ✅

- [x] Core review session model
- [x] Git diff processing and storage
- [x] Basic CLI commands and server runtime
- [ ] Complete filesystem watcher integration
- [ ] MCP protocol foundation

### Phase 1.5: Trust Layer 🔄

- [ ] Structured provenance display
- [ ] Evidence-backed relationship visualization
- [ ] Impact minimap and graph-diff bridging
- [ ] Confidence scoring with inspection support

### Phase 2: Deep Intelligence

- [ ] Tree-sitter parsing backend
- [ ] Cross-file symbol and import analysis
- [ ] Rename detection and impact propagation
- [ ] Advanced grouping algorithms

### Phase 3: Agent Review Loop

- [ ] Structured agent review creation
- [ ] Deterministic self-verification APIs
- [ ] Selective batch approval workflows
- [ ] Review diff subscriptions

---

## License

[MIT](./LICENSE)

---

## Getting Started

```bash
pnpm install -g ringi
ringi review create
```
