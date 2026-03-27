import { CoreLive } from "@ringi/core/runtime";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";

import type { McpConfigShape } from "@/mcp/config";
import { McpConfigLive } from "@/mcp/config";

const makeConfigLayer = (config: McpConfigShape) =>
  ConfigProvider.layer(
    ConfigProvider.fromUnknown({
      DB_PATH: config.dbPath,
      REPOSITORY_PATH: config.repoRoot,
    })
  );

const makeMcpLayer = (config: McpConfigShape) =>
  Layer.mergeAll(CoreLive, McpConfigLive(config)).pipe(
    Layer.provideMerge(makeConfigLayer(config))
  );

/** The concrete environment provided by the MCP runtime layer. */
export type McpRuntimeContext = Layer.Success<ReturnType<typeof makeMcpLayer>>;

/** Typed MCP managed runtime — no `any` in the environment or error channels. */
export type McpManagedRuntime = ManagedRuntime.ManagedRuntime<
  McpRuntimeContext,
  never
>;

export const createMcpRuntime = (config: McpConfigShape): McpManagedRuntime =>
  ManagedRuntime.make(makeMcpLayer(config)) as McpManagedRuntime;
