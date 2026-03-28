import { Command } from "effect/unstable/cli";
import { describe, expect, it } from "vitest";

import { ringiCommand } from "@/cli/commands";

describe("ringiCommand", () => {
  it("is a valid Command", () => {
    expect(Command.isCommand(ringiCommand)).toBe(true);
  });

  it("has the name 'ringi'", () => {
    expect(ringiCommand.name).toBe("ringi");
  });

  it("has subcommands registered", () => {
    expect(ringiCommand.subcommands.length).toBeGreaterThan(0);
    const names = ringiCommand.subcommands.flatMap((g) =>
      g.commands.map((c: any) => c.name)
    );
    expect(names).toContain("review");
    expect(names).toContain("source");
    expect(names).toContain("todo");
    expect(names).toContain("serve");
    expect(names).toContain("mcp");
    expect(names).toContain("doctor");
    expect(names).toContain("events");
    expect(names).toContain("data");
  });
});
