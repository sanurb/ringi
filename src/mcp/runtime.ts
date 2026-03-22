import * as ConfigProvider from "effect/ConfigProvider";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";

import { CoreLive } from "@/core/runtime";
import { McpConfigLive } from "@/mcp/config";
import type { McpConfigShape } from "@/mcp/config";

const makeConfigLayer = (config: McpConfigShape) =>
  Layer.setConfigProvider(
    ConfigProvider.fromMap(
      new Map([
        ["DB_PATH", config.dbPath],
        ["REPOSITORY_PATH", config.repoRoot],
      ])
    )
  );

export const createMcpRuntime = (config: McpConfigShape) =>
  ManagedRuntime.make(
    Layer.mergeAll(CoreLive, McpConfigLive(config)).pipe(
      Layer.provideMerge(makeConfigLayer(config))
    )
  );
