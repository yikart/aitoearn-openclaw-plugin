import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({
      tools: [
        {
          name: "test_tool",
          description: "A test tool",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    }),
    callTool: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "test result" }],
    }),
  })),
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: vi.fn().mockImplementation(() => ({})),
}));

vi.mock("openclaw/plugin-sdk/plugin-entry", () => ({
  definePluginEntry: vi.fn((entry) => entry),
}));

import pluginEntry from "./index.js";

describe("AiToEarn OpenClaw Plugin", () => {
  let registeredTools: Array<{ name: string; execute: Function }>;
  let mockApi: {
    pluginConfig: { apiKey: string; baseUrl?: string };
    registerTool: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    registeredTools = [];
    mockApi = {
      pluginConfig: {
        apiKey: "test-api-key",
        baseUrl: "https://test.aitoearn.ai/api",
      },
      registerTool: vi.fn((tool) => {
        registeredTools.push(tool);
      }),
    };
  });

  it("should have correct plugin metadata", () => {
    expect(pluginEntry.id).toBe("aitoearn");
    expect(pluginEntry.name).toBe("AiToEarn");
    expect(pluginEntry.description).toBe("Bridge to AiToEarn MCP server for social media management tools");
  });

  it("should have configSchema with validation", () => {
    expect(pluginEntry.configSchema).toBeDefined();
    expect(pluginEntry.configSchema.safeParse).toBeDefined();

    const validResult = pluginEntry.configSchema.safeParse!({ apiKey: "test" });
    expect(validResult.success).toBe(true);

    // Empty config is now valid since apiKey is optional
    const emptyResult = pluginEntry.configSchema.safeParse!({});
    expect(emptyResult.success).toBe(true);
  });

  it("should register MCP tools on initialization", async () => {
    await pluginEntry.register(mockApi as any);

    expect(mockApi.registerTool).toHaveBeenCalled();
    expect(registeredTools.length).toBeGreaterThan(0);
    expect(registeredTools[0].name).toBe("test_tool");
  });

  it("should use default baseUrl when not provided", async () => {
    mockApi.pluginConfig.baseUrl = undefined;

    await pluginEntry.register(mockApi as any);

    expect(mockApi.registerTool).toHaveBeenCalled();
  });

  it("should execute tool and return result", async () => {
    await pluginEntry.register(mockApi as any);

    const tool = registeredTools[0];
    const result = await tool.execute("test-call-id", { input: "test" });

    expect(result).toEqual({
      content: [{ type: "text", text: "test result" }],
      details: null,
    });
  });
});
