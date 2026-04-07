# Testing Guidance

## Policy

Mocking frameworks are **banned**:

- No `vi.mock()`
- No `vi.spyOn()`
- No `vi.stubGlobal()`

Tests will be rejected if they use any of the above.

## Allowed Patterns

- **Stub injection** — pass test doubles via constructor or function parameters.
- **Parameter DI** — services accept dependencies as arguments, swap in test implementations.

## Runner

Tests run via vitest through the `vp` toolchain:

```bash
pnpm test          # Run all tests across workspaces
```

## Principles

- Tests should exercise real service layers with injected stubs, not intercepted module boundaries.
- Prefer integration-style tests that compose real layers over isolated unit tests with faked internals.
- Effect services are testable by providing test Layers — use this as the primary DI mechanism.
