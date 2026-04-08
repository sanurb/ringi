# Work Plan: Agent Integration — Context Builder → ACP

> Implementation sequence and GitHub issue breakdown.
> Created: 2026-04-07

---

## Implementation Sequence

```
1. CTX-1 (#17) ReviewContextBuilder service (core domain)
       ↓
2. CTX-2 (#18) Review context API endpoint
3. CTX-3 (#19) MCP sandbox integration      ← parallel with #18
4. CTX-4 (#20) CLI export --format prompt    ← after #18
       ↓
5. ACP-1 (#22) Spike: evaluate ACP client integration (time-boxed)
       ↓
6. ACP-2 (#23) Session context compression (core domain)
       ↓
7. Future: ACP client adapter (issues created after spike)
```

## Parent Issues

| # | Title | Tracks |
|---|---|---|
| #21 | feat: review-context builder and agent feedback surface | #17, #18, #19, #20 |
| #24 | feat: ACP agent integration surface | #22, #23, future |

## Dependency Graph

```
#17 (context builder)
  ├── #18 (API endpoint)  ──── blocked by #17
  ├── #19 (MCP sandbox)   ──── blocked by #17
  └── #20 (CLI export)    ──── blocked by #17, #18

#22 (ACP spike)           ──── blocked by #21 (all context builder work)
  └── #23 (session ctx)   ──── blocked by #22

Future ACP adapter        ──── blocked by #22, #23
```

## Design Principles

1. **Context builder is core, not adapter.** It lives in `packages/core`, depends on domain services, has no transport imports.
2. **ACP is transport, not domain.** The ACP adapter maps protocol primitives to core service calls. Core never imports ACP types.
3. **MCP and ACP coexist.** MCP provides tool access (sandboxed execute). ACP provides session communication (bidirectional RPC). Different purposes, same core underneath.
4. **No multi-provider adapter.** ACP eliminates the need for per-agent SDKs. One protocol, any compliant agent.
5. **Context before transport.** The context builder (#17) ships before ACP (#22) because it makes the existing MCP surface immediately more useful.
