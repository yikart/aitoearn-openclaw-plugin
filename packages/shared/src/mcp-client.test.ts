import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface MockSdkClient {
  transport: Record<string, unknown> | undefined;
  onclose?: () => void;
  connect: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  listTools: ReturnType<typeof vi.fn>;
  callTool: ReturnType<typeof vi.fn>;
}

const sdkClientMock = vi.hoisted(() => {
  const clients: MockSdkClient[] = [];
  const queuedSetups: Array<(client: MockSdkClient) => void> = [];

  return {
    clients,
    queueClientSetup(setup: (client: MockSdkClient) => void) {
      queuedSetups.push(setup);
    },
    reset() {
      clients.length = 0;
      queuedSetups.length = 0;
    },
    createClient() {
      const client: MockSdkClient = {
        transport: {},
        onclose: undefined,
        connect: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockImplementation(async () => {
          if (!client.transport) {
            return;
          }

          client.transport = undefined;
          client.onclose?.();
        }),
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        callTool: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: "ok" }],
        }),
      };

      clients.push(client);
      queuedSetups.shift()?.(client);
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
    sdkClientMock.reset();
    vi.useFakeTimers();
    await resetMcpClient();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries listTools with an isolated fallback after a connection-closed error", async () => {
    sdkClientMock.queueClientSetup((client) => {
      client.listTools.mockRejectedValueOnce(
        new Error("MCP error -32000: Connection closed")
      );
    });
    sdkClientMock.queueClientSetup((client) => {
      client.listTools.mockResolvedValueOnce({
        tools: [{ name: "toolA" }],
      });
    });

    const resultPromise = listMcpTools("test-api-key", "https://aitoearn.ai/api");
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toEqual({ tools: [{ name: "toolA" }] });
    expect(sdkClientMock.clients).toHaveLength(2);
    expect(sdkClientMock.clients[0].listTools).toHaveBeenCalledTimes(1);
    expect(sdkClientMock.clients[1].listTools).toHaveBeenCalledTimes(1);
  });

  it("retries callTool after a retryable tool error result without requiring isError", async () => {
    sdkClientMock.queueClientSetup((client) => {
      client.callTool.mockResolvedValueOnce({
        structuredContent: {
          status: "error",
          tool: "getallaccounts",
          error: "MCP error -32000: Connection closed",
        },
        content: [
          {
            type: "text",
            text: '{"status":"error","tool":"getallaccounts","error":"MCP error -32000: Connection closed"}',
          },
        ],
      });
    });
    sdkClientMock.queueClientSetup((client) => {
      client.callTool.mockResolvedValueOnce({
        content: [{ type: "text", text: "ok" }],
      });
    });

    const resultPromise = callMcpTool(
      "test-api-key",
      "https://aitoearn.ai/api",
      "getAllAccounts",
      {}
    );
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toEqual({
      content: [{ type: "text", text: "ok" }],
    });
    expect(sdkClientMock.clients).toHaveLength(2);
    expect(sdkClientMock.clients[0].callTool).toHaveBeenCalledTimes(1);
    expect(sdkClientMock.clients[1].callTool).toHaveBeenCalledTimes(1);
  });

  it("does not retry non-connection tool error results", async () => {
    sdkClientMock.queueClientSetup((client) => {
      client.callTool.mockResolvedValueOnce({
        isError: true,
        content: [{ type: "text", text: "Insufficient balance" }],
      });
    });

    const result = await callMcpTool(
      "test-api-key",
      "https://aitoearn.ai/api",
      "acceptTask",
      {}
    );

    expect(result).toEqual({
      isError: true,
      content: [{ type: "text", text: "Insufficient balance" }],
    });
    expect(sdkClientMock.clients).toHaveLength(1);
    expect(sdkClientMock.clients[0].callTool).toHaveBeenCalledTimes(1);
  });

  it("creates a fresh shared client after the previous shared client is closed remotely", async () => {
    sdkClientMock.queueClientSetup((client) => {
      client.listTools.mockResolvedValueOnce({
        tools: [{ name: "first" }],
      });
    });

    const first = await listMcpTools("test-api-key", "https://aitoearn.ai/api");
    expect(first).toEqual({ tools: [{ name: "first" }] });
    expect(sdkClientMock.clients).toHaveLength(1);

    sdkClientMock.clients[0].transport = undefined;
    sdkClientMock.clients[0].onclose?.();

    sdkClientMock.queueClientSetup((client) => {
      client.listTools.mockResolvedValueOnce({
        tools: [{ name: "second" }],
      });
    });

    const second = await listMcpTools("test-api-key", "https://aitoearn.ai/api");
    expect(second).toEqual({ tools: [{ name: "second" }] });
    expect(sdkClientMock.clients).toHaveLength(2);
    expect(sdkClientMock.clients[1].listTools).toHaveBeenCalledTimes(1);
  });

  it("does not close a shared client while another request is still using it", async () => {
    let resolveFirstCall:
      | ((value: { content: Array<{ type: string; text: string }> }) => void)
      | null = null;

    sdkClientMock.queueClientSetup((client) => {
      client.callTool
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveFirstCall = resolve as typeof resolveFirstCall;
            })
        )
        .mockRejectedValueOnce(new Error("MCP error -32000: Connection closed"));
    });
    sdkClientMock.queueClientSetup((client) => {
      client.callTool.mockResolvedValueOnce({
        content: [{ type: "text", text: "retry ok" }],
      });
    });

    const firstPromise = callMcpTool(
      "test-api-key",
      "https://aitoearn.ai/api",
      "getAllAccounts",
      { requestId: "first" }
    );
    await flushMicrotasks();

    const secondPromise = callMcpTool(
      "test-api-key",
      "https://aitoearn.ai/api",
      "getAllAccounts",
      { requestId: "second" }
    );
    await flushMicrotasks();

    expect(sdkClientMock.clients).toHaveLength(1);
    expect(sdkClientMock.clients[0].close).not.toHaveBeenCalled();

    resolveFirstCall?.({
      content: [{ type: "text", text: "first ok" }],
    });

    await vi.runAllTimersAsync();

    const [firstResult, secondResult] = await Promise.all([
      firstPromise,
      secondPromise,
    ]);

    expect(firstResult).toEqual({
      content: [{ type: "text", text: "first ok" }],
    });
    expect(secondResult).toEqual({
      content: [{ type: "text", text: "retry ok" }],
    });
    expect(sdkClientMock.clients).toHaveLength(2);
    expect(sdkClientMock.clients[0].close).toHaveBeenCalledTimes(1);
    expect(sdkClientMock.clients[1].callTool).toHaveBeenCalledTimes(1);
  });
});

async function flushMicrotasks(times = 5): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve();
  }
}
