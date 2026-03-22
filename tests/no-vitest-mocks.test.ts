import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

const REPO_ROOT = process.cwd();
const OXLINT_BIN = path.join(REPO_ROOT, "node_modules", ".bin", "oxlint");
const OXLINT_CONFIG = path.join(REPO_ROOT, ".oxlintrc.json");
const OXLINT_TEMP_ROOT = path.join(REPO_ROOT, ".tmp-oxlint-");
const RULE_ID = "ringi(no-vitest-mocks)";
const MESSAGE_SUFFIX =
  " is banned. Use hand-written stubs or constructor/parameter dependency injection instead. Never mock anything.";

const lintSource = async function lintSource(source: string) {
  const directory = await mkdtemp(OXLINT_TEMP_ROOT);
  const filePath = path.join(directory, "example.test.ts");

  await writeFile(filePath, source, "utf8");

  try {
    const result = await execFileAsync(
      OXLINT_BIN,
      ["-c", OXLINT_CONFIG, "--format", "json", filePath],
      { cwd: REPO_ROOT }
    );

    return {
      exitCode: 0,
      output: result.stdout,
    };
  } catch (error) {
    const executionError = error as {
      code?: number;
      stdout?: string;
    };

    return {
      exitCode: executionError.code ?? 1,
      output: executionError.stdout ?? "",
    };
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
};

const getMessages = function getMessages(output: string) {
  const diagnostics = JSON.parse(output) as {
    diagnostics?: {
      code?: string;
      labels?: { message?: string }[];
      message?: string;
    }[];
  };

  return (diagnostics.diagnostics ?? []).flatMap((diagnostic) => {
    const messages = [
      diagnostic.message,
      ...(diagnostic.labels ?? []).map((label) => label.message),
    ].filter((message): message is string => message !== undefined);

    return messages.map((message) => ({
      message,
      ruleId: diagnostic.code,
    }));
  });
};

describe("ringi/no-vitest-mocks", () => {
  it("rejects banned Vitest mocking helpers", async () => {
    const result = await lintSource(`
      import { vi } from "vitest";

      vi.mock("./dep");
      vi.spyOn(console, "log");
      vi["stubGlobal"]("location", {});
    `);

    expect(result.exitCode).toBe(1);

    const messages = getMessages(result.output).filter(
      ({ ruleId }) => ruleId === RULE_ID
    );

    expect(messages).toHaveLength(3);
    expect(messages.map(({ message }) => message)).toEqual([
      `vi.mock()${MESSAGE_SUFFIX}`,
      `vi.spyOn()${MESSAGE_SUFFIX}`,
      `vi.stubGlobal()${MESSAGE_SUFFIX}`,
    ]);
  });

  it("rejects aliased or global Vitest vi bindings", async () => {
    const importedAlias = await lintSource(`
      import { vi as testHarness } from "vitest";

      testHarness.mock("./dep");
    `);

    expect(importedAlias.exitCode).toBe(1);
    expect(
      getMessages(importedAlias.output).some(
        ({ message, ruleId }) =>
          ruleId === RULE_ID && message === `vi.mock()${MESSAGE_SUFFIX}`
      )
    ).toBe(true);

    const globalVi = await lintSource(`
      vi.spyOn(console, "error");
    `);

    expect(globalVi.exitCode).toBe(1);
    expect(
      getMessages(globalVi.output).some(
        ({ message, ruleId }) =>
          ruleId === RULE_ID && message === `vi.spyOn()${MESSAGE_SUFFIX}`
      )
    ).toBe(true);
  });

  it("does not flag a locally shadowed alias as a Vitest vi binding", async () => {
    const result = await lintSource(`
      import { vi as testHarness } from "vitest";

      const run = () => {
        const testHarness = { mock: () => "local helper" };
        return testHarness.mock();
      };

      run();
    `);

    const messages = getMessages(result.output).filter(
      ({ ruleId }) => ruleId === RULE_ID
    );

    expect(messages).toEqual([]);
  });

  it("allows hand-written stubs and unrelated local vi objects", async () => {
    const result = await lintSource(`
      import { expect, it } from "vitest";

      const vi = {
        mock() {
          return "local helper";
        },
      };

      function useLocalVi(
        dependency: { run: () => string },
        overrides: { mock: () => string }
      ) {
        overrides.mock();
        return dependency.run();
      }

      it("uses stubs without triggering the lint rule", () => {
        expect(vi.mock()).toBe("local helper");
        expect(
          useLocalVi(
            { run: () => "ok" },
            { mock: () => "stub" }
          )
        ).toBe("ok");
      });
    `);

    expect(result.exitCode).toBe(0);
    expect(getMessages(result.output)).toEqual([]);
  });
});
