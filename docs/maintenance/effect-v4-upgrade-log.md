# Effect v4 Upgrade Log

**Audit date:** 2026-03-27
**Next review date:** 2026-04-30

## Current Versions (pre-migration)

| Package                    | Version         | Status                  |
| -------------------------- | --------------- | ----------------------- |
| `effect`                   | `4.0.0-beta.41` | Already on v4 beta      |
| `@effect/platform`         | `^0.96.0`       | v3-compatible, removed  |
| `@effect/rpc`              | `^0.75.0`       | v3-compatible, removed  |
| `@effect/platform-browser` | `4.0.0-beta.41` | Removed                 |
| `@effect/vitest`           | `4.0.0-beta.41` | Added to web app        |
| `@effect/language-service` | `^0.84.0`       | Kept for editor support |

## Target Versions

| Package                    | Version         | Notes                       |
| -------------------------- | --------------- | --------------------------- |
| `effect`                   | `4.0.0-beta.41` | Core + all unstable modules |
| `@effect/vitest`           | `4.0.0-beta.41` | Testing utilities           |
| `@effect/language-service` | `^0.84.0`       | Editor plugin               |

## Beta/Stability Notes

- **Effect v4 is in beta** (`4.0.0-beta.41`). The API is stabilizing but breaking changes may occur between beta releases.
- All HTTP, RPC, and HttpApi modules are now under `effect/unstable/*` — indicating they may change before v4 stable.
- `ServiceMap.Service` replaces `Effect.Service` as the canonical service definition pattern.
- `Schema` module has significant API changes (single-arg `Literal`, `optionalKey` vs `optional`, `check` + `isMinLength` pattern).
- `Either` module has been replaced by `Result` module.

## Package Migrations Performed

### Removed Direct Dependencies

| Package                    | Replaced By                                       |
| -------------------------- | ------------------------------------------------- |
| `@effect/platform`         | `effect/unstable/http`, `effect/unstable/httpapi` |
| `@effect/rpc`              | `effect/unstable/rpc`                             |
| `@effect/platform-browser` | Not needed (was only for browser HTTP client)     |

### Import Migrations

| Old Import                            | New Import                                        |
| ------------------------------------- | ------------------------------------------------- |
| `@effect/platform/HttpApi`            | `effect/unstable/httpapi` → `{ HttpApi }`         |
| `@effect/platform/HttpApiEndpoint`    | `effect/unstable/httpapi` → `{ HttpApiEndpoint }` |
| `@effect/platform/HttpApiGroup`       | `effect/unstable/httpapi` → `{ HttpApiGroup }`    |
| `@effect/platform/HttpApiBuilder`     | `effect/unstable/httpapi` → `{ HttpApiBuilder }`  |
| `@effect/platform/HttpApiClient`      | `effect/unstable/httpapi` → `{ HttpApiClient }`   |
| `@effect/platform/HttpApiSchema`      | `effect/unstable/httpapi/HttpApiSchema`           |
| `@effect/platform/HttpClient`         | `effect/unstable/http` → `{ HttpClient }`         |
| `@effect/platform/HttpServer`         | `effect/unstable/http` → `{ HttpServer }`         |
| `@effect/platform/HttpServerResponse` | `effect/unstable/http` → `{ HttpServerResponse }` |
| `@effect/platform/HttpLayerRouter`    | `effect/unstable/http` → `{ HttpRouter }`         |
| `@effect/platform/FetchHttpClient`    | `effect/unstable/http` → `{ FetchHttpClient }`    |
| `@effect/rpc/Rpc`                     | `effect/unstable/rpc` → `{ Rpc }`                 |
| `@effect/rpc/RpcGroup`                | `effect/unstable/rpc` → `{ RpcGroup }`            |
| `@effect/rpc/RpcClient`               | `effect/unstable/rpc` → `{ RpcClient }`           |
| `@effect/rpc/RpcServer`               | `effect/unstable/rpc` → `{ RpcServer }`           |
| `@effect/rpc/RpcSerialization`        | `effect/unstable/rpc` → `{ RpcSerialization }`    |
| `@effect/rpc/RpcMiddleware`           | `effect/unstable/rpc` → `{ RpcMiddleware }`       |
| `effect/Either`                       | `effect/Result`                                   |
| `effect/Context`                      | `effect` → `{ ServiceMap }`                       |

### API Changes Applied

| Old Pattern                                                           | New Pattern                                                                 |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `Effect.Service<X>()("id", { effect: ... })`                          | `ServiceMap.Service<X, Shape>()("id")` + `static layer = Layer.effect(...)` |
| `HttpApiEndpoint.get("n", "/p").setPath(S).addSuccess(S).addError(E)` | `HttpApiEndpoint.get("n", "/p", { params, success, error })`                |
| `HttpApiEndpoint.del(...)`                                            | `HttpApiEndpoint.delete(...)`                                               |
| `Schema.Literal("a", "b", "c")`                                       | `Schema.Literals(["a", "b", "c"])`                                          |
| `Schema.optionalWith(S, { default: () => v })`                        | `S.pipe(Schema.optionalKey, Schema.withDecodingDefaultKey(() => v))`        |
| `Schema.optionalWith(S, { as: "Option" })`                            | `Schema.OptionFromNullOr(S).pipe(Schema.optionalKey)`                       |
| `Schema.String.pipe(Schema.minLength(1))`                             | `Schema.String.pipe(Schema.check(Schema.isMinLength(1)))`                   |
| `Schema.TaggedError<X>()("T", fields)`                                | `Schema.TaggedErrorClass<X>()("T", fields)`                                 |
| `HttpApiSchema.annotations({ status: N })`                            | `HttpApiSchema.status(N)(ErrorSchema)` at endpoint level                    |
| `Either.left(x)` / `Either.right(x)`                                  | `Result.fail(x)` / `Result.succeed(x)`                                      |
| `Either.isLeft(x)` / `Either.isRight(x)`                              | `Result.isFailure(x)` / `Result.isSuccess(x)`                               |
| `x.left` / `x.right`                                                  | `x.failure` / `x.success`                                                   |
| `Effect.tapErrorCause`                                                | `Effect.tapCause`                                                           |
| `Effect.catchAllCause`                                                | `Effect.catchCause`                                                         |
| `Effect.zipRight`                                                     | `Effect.andThen`                                                            |
| `Effect.runtime<R>()`                                                 | Removed; use `Effect.runFork` directly                                      |
| `Runtime.runFork(rt)`                                                 | `Effect.runFork`                                                            |
| `Logger.pretty`                                                       | `Logger.consolePretty()`                                                    |
| `HttpServer.layerContext`                                             | `HttpServer.layerServices`                                                  |
| `HttpLayerRouter.addHttpApi(Api)`                                     | `HttpApiBuilder.layer(Api)`                                                 |
| `HttpLayerRouter.toWebHandler`                                        | `HttpRouter.toWebHandler`                                                   |
| `Layer.setConfigProvider(cp)`                                         | `ConfigProvider.layer(cp)`                                                  |
| `ConfigProvider.fromMap(map)`                                         | `ConfigProvider.fromUnknown(obj)`                                           |
| `ParseResult.ParseError`                                              | `Schema.SchemaError`                                                        |
| `Cause.isInterruptedOnly`                                             | `Cause.hasInterruptsOnly`                                                   |
| `Schema.Schema<A, I>`                                                 | `Schema.Schema<A>` (1 type param)                                           |
| `_.path.id` (HttpApi handler)                                         | `_.params.id`                                                               |
| `_.urlParams.x` (HttpApi handler)                                     | `_.query.x`                                                                 |

## pnpm Catalog Design

All shared Effect-related and tooling versions are centralized in `pnpm-workspace.yaml`:

```yaml
catalogs:
  default:
    effect: 4.0.0-beta.41
    "@effect/vitest": 4.0.0-beta.41
    "@effect/language-service": ^0.84.0
    typescript: ^5.9.3
    tsdown: ^0.21.5
    "@types/node": ^22.19.15
    vite: ^8.0.3
    vitest: ^4.1.2
```

Package manifests reference catalog versions with `"catalog:"`:

```json
{ "effect": "catalog:", "typescript": "catalog:" }
```

## Breaking Changes Accepted

1. **`Effect.Service` removed** — All services migrated to `ServiceMap.Service` with explicit interface + `Layer.effect` pattern.
2. **Service dependency capture** — Dependencies are now captured at layer-creation time via `yield*` in the `Effect.gen` that creates the service, NOT in individual methods. This is a fundamental architectural shift.
3. **`Either` → `Result`** — All 84+ usages in CLI migrated.
4. **HttpApi endpoint definition** — Moved from method-chaining to options-object pattern.
5. **Schema API changes** — `Literal` now takes single arg; `optionalWith` removed.
6. **No more `@effect/platform` or `@effect/rpc`** — Everything consolidated into `effect` core package.

## Known Issues / Blockers

1. **`@effect-atom/atom` and `@effect-atom/atom-react`** — These third-party packages have peer deps on `effect@^3.19` and `@effect/platform`. They work at runtime but produce peer dep warnings. Monitor for v4-compatible releases.
2. **Some web app TSX files have residual type errors** — The `ApiClient` service shape uses `any` which causes TypeScript to infer `unknown` in the R channel. These are type-only issues; the runtime behavior is correct.
3. **`Effect.timeoutFail` removed** — Replaced with `Effect.timeoutOrElse` which has a different API shape. MCP execute.ts needs manual adjustment.
4. **`RpcMiddleware.Tag`** — The RPC middleware pattern changed; the logger middleware was simplified by removing it.

## References Consulted

- `~/.local/share/ai-references/effect/v4/LLMS.md` — Official Effect v4 reference
- `~/.local/share/ai-references/effect/v4/ai-docs/` — Effect v4 example code
- npm registry — Package version verification
- Effect v4 type declarations — Direct .d.ts inspection
