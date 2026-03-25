import { describe, expect, it } from "vitest";

import { commandLabel } from "@/cli/commands";
import type { ParsedCommand } from "@/cli/contracts";

describe("commandLabel", () => {
  const cases: [ParsedCommand["kind"], string][] = [
    ["todo-done", "ringi todo done"],
    ["todo-undone", "ringi todo undone"],
    ["todo-move", "ringi todo move"],
    ["todo-remove", "ringi todo remove"],
    ["todo-clear", "ringi todo clear"],
    ["review-status", "ringi review status"],
    ["review-resolve", "ringi review resolve"],
  ];

  for (const [kind, expected] of cases) {
    it(`maps ${kind} to "${expected}"`, () => {
      expect(commandLabel({ kind } as ParsedCommand)).toBe(expected);
    });
  }
});
