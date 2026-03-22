import { stdin, stdout } from "node:process";

import { resolveMcpConfig } from "@/mcp/config";
import { executeCode } from "@/mcp/execute";
import type { ExecuteInput } from "@/mcp/execute";
import { createMcpRuntime } from "@/mcp/runtime";

const JSON_RPC_VERSION = "2.0";
const LATEST_PROTOCOL_VERSION = "2025-11-25";
const MCP_SERVER_NAME = "ringi";
const MCP_SERVER_VERSION = process.env.npm_package_version ?? "0.0.0-dev";

const EXECUTE_TOOL = {
  description:
    "Run constrained JavaScript against Ringi review namespaces: review, todo, comment, diff, export, and session.",
  inputSchema: {
    additionalProperties: false,
    properties: {
      code: {
        description:
          "JavaScript snippet to evaluate inside the Ringi MCP sandbox.",
        type: "string",
      },
      timeout: {
        description:
          "Optional timeout in milliseconds. Defaults to 30000 and clamps at 120000.",
        type: "number",
      },
    },
    required: ["code"],
    type: "object",
  },
  name: "execute",
  outputSchema: {
    additionalProperties: false,
    properties: {
      error: { type: "string" },
      ok: { type: "boolean" },
      result: {},
      truncated: { type: "boolean" },
    },
    required: ["ok", "result"],
    type: "object",
  },
} as const;

type JsonRpcId = number | string | null;

interface JsonRpcRequest {
  readonly id?: JsonRpcId;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

const writeStderr = (message: string): void => {
  process.stderr.write(`[ringi:mcp] ${message}\n`);
};

const writeMessage = (message: unknown): void => {
  const body = JSON.stringify(message);
  const payload = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
  stdout.write(payload);
};

const parseContentLength = (headerText: string): number => {
  const headerLine = headerText
    .split("\r\n")
    .find((line) => line.toLowerCase().startsWith("content-length:"));

  if (!headerLine) {
    throw new Error("Missing Content-Length header");
  }

  const rawValue = headerLine.slice(headerLine.indexOf(":") + 1).trim();
  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid Content-Length header: ${rawValue}`);
  }

  return parsed;
};

const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

const sendError = (id: JsonRpcId, code: number, message: string): void => {
  writeMessage({
    error: {
      code,
      message,
    },
    id,
    jsonrpc: JSON_RPC_VERSION,
  });
};

const sendResult = (id: JsonRpcId, result: unknown): void => {
  writeMessage({
    id,
    jsonrpc: JSON_RPC_VERSION,
    result,
  });
};

const createInitializeResult = () => ({
  capabilities: {
    tools: {
      listChanged: false,
    },
  },
  protocolVersion: LATEST_PROTOCOL_VERSION,
  serverInfo: {
    description:
      "Local-first MCP codemode adapter over the Ringi core runtime.",
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  },
});

class StdioJsonRpcServer {
  private readonly config = resolveMcpConfig(process.argv.slice(2));

  private readonly runtime = createMcpRuntime(this.config);

  private buffer = Buffer.alloc(0);

  private initialized = false;

  private shuttingDown = false;

  public start(): void {
    stdin.on("data", async (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      try {
        await this.drainBuffer();
      } catch (error) {
        writeStderr(`fatal buffer drain error: ${formatError(error)}`);
      }
    });

    stdin.on("end", async () => {
      await this.runtime.dispose();
    });

    process.on("SIGINT", async () => {
      await this.close(0);
    });

    process.on("SIGTERM", async () => {
      await this.close(0);
    });

    writeStderr(
      `server started readonly=${String(this.config.readonly)} repo=${this.config.repoRoot}`
    );
  }

  private async close(code: number): Promise<void> {
    await this.runtime.dispose();
    process.exit(code);
  }

  private async drainBuffer(): Promise<void> {
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        return;
      }

      const headerText = this.buffer.subarray(0, headerEnd).toString("utf8");
      const contentLength = parseContentLength(headerText);
      const messageEnd = headerEnd + 4 + contentLength;
      if (this.buffer.byteLength < messageEnd) {
        return;
      }

      const payload = this.buffer
        .subarray(headerEnd + 4, messageEnd)
        .toString("utf8");
      this.buffer = this.buffer.subarray(messageEnd);

      let message: JsonRpcRequest;
      try {
        message = JSON.parse(payload) as JsonRpcRequest;
      } catch (error) {
        sendError(null, -32_700, `Parse error: ${formatError(error)}`);
        continue;
      }

      await this.handleMessage(message);
    }
  }

  private async handleMessage(message: JsonRpcRequest): Promise<void> {
    if (typeof message.method !== "string") {
      sendError(message.id ?? null, -32_600, "Invalid JSON-RPC request");
      return;
    }

    try {
      if (await this.handleLifecycleMessage(message)) {
        return;
      }

      this.assertInitialized();

      if (message.method === "tools/list") {
        sendResult(message.id ?? null, { tools: [EXECUTE_TOOL] });
        return;
      }

      if (message.method === "tools/call") {
        await this.handleToolCall(message.id ?? null, message.params);
        return;
      }

      sendError(
        message.id ?? null,
        -32_601,
        `Method not found: ${message.method}`
      );
    } catch (error) {
      sendError(message.id ?? null, -32_603, formatError(error));
    }
  }

  private async handleLifecycleMessage(
    message: JsonRpcRequest
  ): Promise<boolean> {
    if (message.method === "initialize") {
      this.initialized = true;
      sendResult(message.id ?? null, createInitializeResult());
      return true;
    }

    if (message.method === "notifications/initialized") {
      return true;
    }

    if (message.method === "ping") {
      sendResult(message.id ?? null, {});
      return true;
    }

    if (message.method === "shutdown") {
      this.shuttingDown = true;
      sendResult(message.id ?? null, {});
      return true;
    }

    if (message.method === "exit") {
      await this.close(this.shuttingDown ? 0 : 1);
      return true;
    }

    return false;
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error("Server is not initialized");
    }

    if (this.shuttingDown) {
      throw new Error("Server is shutting down");
    }
  }

  private async handleToolCall(
    id: JsonRpcId,
    params: Record<string, unknown> | undefined
  ): Promise<void> {
    if (!params || typeof params.name !== "string") {
      sendError(id, -32_602, "Invalid tools/call params");
      return;
    }

    if (params.name !== EXECUTE_TOOL.name) {
      sendError(id, -32_602, `Tool not found: ${String(params.name)}`);
      return;
    }

    const argumentsValue = params.arguments;
    if (typeof argumentsValue !== "object" || argumentsValue === null) {
      sendError(id, -32_602, "Invalid tools/call arguments");
      return;
    }

    const executeResult = await executeCode(
      this.runtime,
      this.config,
      argumentsValue as ExecuteInput
    );

    sendResult(id, {
      content: [
        {
          text: JSON.stringify(executeResult),
          type: "text",
        },
      ],
      isError: !executeResult.ok,
      structuredContent: executeResult,
    });
  }
}

new StdioJsonRpcServer().start();
