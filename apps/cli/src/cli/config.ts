import { ServiceMap } from "effect";
import * as Layer from "effect/Layer";

export type CliOutputMode = "human" | "json";

/**
 * Captures the resolved CLI environment once so downstream layers do not each
 * read process state independently.
 */
export interface CliConfigShape {
  readonly color: boolean;
  readonly cwd: string;
  readonly dbPath: string;
  readonly outputMode: CliOutputMode;
  readonly quiet: boolean;
  readonly repoRoot: string;
  readonly verbose: boolean;
}

export class CliConfig extends ServiceMap.Service<CliConfig, CliConfigShape>()(
  "@ringi/CliConfig"
) {}

/**
 * Wraps a concrete {@link CliConfigShape} in a layer for the Effect runtime.
 */
export const CliConfigLive = (config: CliConfigShape) =>
  Layer.succeed(CliConfig, CliConfig.of(config));
