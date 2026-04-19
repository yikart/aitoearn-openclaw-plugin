import { beforeEach, describe, expect, it, vi } from "vitest";

const sdkClientMock = vi.hoisted(() => {
  const clients: Array<{
    connect: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    listTools: ReturnType<typeof vi.fn>;
    callTool: ReturnType<typeof vi.fn>;
  }> = [];
  const listTools = vi.fn();
  const callTool = vi.fn();

  return {
    clients,
    listTools,
    callTool,
    createClient() {
      const client = {
        connect: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        listTools,
        callTool,
      };
      clients.push(client);
      return client;
    },
  };
});

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn().mockImplementation(() => sdkClientMock.createClient()),
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: vi.fn().mockImplementation(() => ({})),
}));

import { callMcpTool, listMcpTools, resetMcpClient } from "./mcp-client.js";

describe("mcp-client retry helpers", () => {
  beforeEach(async () => {
    sdkClientMock.clients.length = 0;
    sdkClientMock.listTools.mockReset();
    sdkClientMock.callTool.mockReset();
    await resetMcpClient();
  });

  it("retries listTools once after a transport failure", async () => {
    sdkClientMock.listTools
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce({ tools: [{ name: "toolA" }] });

    const result = await listMcpTools("test-api-key", "https://aitoearn.ai/api");

    expect(result).toEqual({ tools: [{ name: "toolA" }] });
    expect(sdkClientMock.listTools).toHaveBeenCalledTimes(2);
    expect(sdkClientMock.clients).toHaveLength(2);
  });

  it("retries callTool once after a transport failure", async () => {
    sdkClientMock.callTool
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "ok" }],
      });

    const result = await callMcpTool(
      "test-api-key",
      "https://aitoearn.ai/api",
      "getAllAccounts",
      {}
    );

    expect(result).toEqual({
      content: [{ type: "text", text: "ok" }],
    });
    expect(sdkClientMock.callTool).toHaveBeenCalledTimes(2);
    expect(sdkClientMock.clients).toHaveLength(2);
  });
});
