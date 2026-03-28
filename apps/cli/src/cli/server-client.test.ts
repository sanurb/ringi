import { describe, expect, it } from "vitest";

import { ServerConnectionError, ServerResponseError } from "@/cli/cli-errors";

describe("ServerConnectionError", () => {
  it("includes the URL and cause in the message", () => {
    const error = new ServerConnectionError({
      url: "http://localhost:3000",
      reason: "ECONNREFUSED",
    });
    expect(error.message).toContain("http://localhost:3000");
    expect(error.message).toContain("ECONNREFUSED");
    expect(error._tag).toBe("ServerConnectionError");
  });

  it("uses a provided reason in message", () => {
    const error = new ServerConnectionError({
      url: "http://localhost:3000",
      reason: "Connection refused",
    });
    expect(error.message).toContain("Connection refused");
  });
});

describe("ServerResponseError", () => {
  it("includes status and body in the message", () => {
    const error = new ServerResponseError({
      status: 404,
      statusText: "Not Found",
      body: "Review not found",
    });
    expect(error.message).toBe(
      "Server returned 404 Not Found: Review not found"
    );
    expect(error._tag).toBe("ServerResponseError");
    expect(error.status).toBe(404);
    expect(error.body).toBe("Review not found");
  });
});
