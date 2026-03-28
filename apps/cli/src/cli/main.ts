#!/usr/bin/env node

/**
 * Ringi CLI entrypoint.
 *
 * Uses `effect/unstable/cli` for command parsing, help generation, shell
 * completions, and version display. Each command is defined as a typed
 * `Command` with its own flags/arguments and handler.
 *
 * The old hand-rolled parser, imperative main loop, and manual help text
 * are replaced by the Effect CLI framework.
 */

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";

import { ringiCommand } from "@/cli/commands";

const CLI_VERSION =
  process.env.RINGI_VERSION ?? process.env.npm_package_version ?? "0.0.0-dev";

const program = Command.run(ringiCommand, {
  version: CLI_VERSION,
}).pipe(Effect.provide(NodeServices.layer)) as Effect.Effect<void, any>;

NodeRuntime.runMain(program);
