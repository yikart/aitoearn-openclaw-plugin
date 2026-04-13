import { beforeEach, describe, expect, it, vi } from "vitest";

const configRuntimeMock = vi.hoisted(() => ({
  resolveConfiguredSecretInputString: vi.fn(),
}));

const toolDiscoveryMock = vi.hoisted(() => ({
  applySyncToolDiscoveryLogs: vi.fn(),
  loadToolDefinitionsSync: vi.fn(),
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({
      tools: [],
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

vi.mock("openclaw/plugin-sdk/config-runtime", () => configRuntimeMock);
vi.mock("./src/tool-discovery.js", () => toolDiscoveryMock);

import pluginEntry from "./index.js";

describe("AiToEarn OpenClaw Plugin", () => {
  let registeredTools: Array<{ name: string; execute: Function }>;
  let mockApi: {
    config: Record<string, unknown>;
    pluginConfig: { apiKey?: string | Record<string, unknown>; baseUrl?: string };
    logger: {
      info: ReturnType<typeof vi.fn>;
      warn: ReturnType<typeof vi.fn>;
      error: ReturnType<typeof vi.fn>;
    };
    runtime: {
      state: {
        resolveStateDir: ReturnType<typeof vi.fn>;
      };
    };
    registerCli: ReturnType<typeof vi.fn>;
    registerTool: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    registeredTools = [];
    configRuntimeMock.resolveConfiguredSecretInputString.mockReset();
    configRuntimeMock.resolveConfiguredSecretInputString.mockResolvedValue({
      value: "test-api-key",
    });
    toolDiscoveryMock.applySyncToolDiscoveryLogs.mockReset();
    toolDiscoveryMock.loadToolDefinitionsSync.mockReset();
    toolDiscoveryMock.loadToolDefinitionsSync.mockReturnValue({
      source: "remote",
      tools: [
        {
          name: "test_tool",
          description: "A synced tool",
          inputSchema: { type: "object", properties: {} },
        },
      ],
      logs: [],
    });

    mockApi = {
      config: {},
      pluginConfig: {
        apiKey: "test-api-key",
        baseUrl: "https://test.aitoearn.ai/api",
      },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      runtime: {
        state: {
          resolveStateDir: vi.fn(() => "/tmp/openclaw-state"),
        },
      },
      registerCli: vi.fn(),
      registerTool: vi.fn((tool) => {
        registeredTools.push(tool);
      }),
    };
  });

  it("should have correct plugin metadata", () => {
    expect(pluginEntry.id).toBe("aitoearn");
    expect(pluginEntry.name).toBe("AiToEarn");
    expect(pluginEntry.description).toBe("AiToEarn social media management tools");
  });

  it("should have configSchema with validation", () => {
    expect(pluginEntry.configSchema).toBeDefined();
    expect(pluginEntry.configSchema.safeParse).toBeDefined();

    const validResult = pluginEntry.configSchema.safeParse!({ apiKey: "test" });
    expect(validResult.success).toBe(true);

    const secretRefResult = pluginEntry.configSchema.safeParse!({
      apiKey: { source: "env", provider: "default", id: "AITOEARN_API_KEY" },
    });
    expect(secretRefResult.success).toBe(true);

    const emptyResult = pluginEntry.configSchema.safeParse!({});
    expect(emptyResult.success).toBe(true);
  });

  it("should register CLI and synced MCP tools on initialization", async () => {
    await pluginEntry.register(mockApi as any);

    expect(mockApi.registerCli).toHaveBeenCalled();
    expect(toolDiscoveryMock.loadToolDefinitionsSync).toHaveBeenCalledWith({
      config: mockApi.config,
      pluginConfig: {
        apiKey: "test-api-key",
        baseUrl: "https://test.aitoearn.ai/api",
      },
      stateDir: "/tmp/openclaw-state",
    });
    expect(toolDiscoveryMock.applySyncToolDiscoveryLogs).toHaveBeenCalled();
    expect(mockApi.registerTool).toHaveBeenCalledTimes(1);
    expect(registeredTools[0].name).toBe("test_tool");
  });

  it("should use default baseUrl when not provided", async () => {
    mockApi.pluginConfig.baseUrl = undefined;

    await pluginEntry.register(mockApi as any);

    expect(toolDiscoveryMock.loadToolDefinitionsSync).toHaveBeenCalledWith({
      config: mockApi.config,
      pluginConfig: {
        apiKey: "test-api-key",
        baseUrl: "https://aitoearn.ai/api",
      },
      stateDir: "/tmp/openclaw-state",
    });
    expect(mockApi.registerTool).toHaveBeenCalled();
  });

  it("should resolve SecretRef API keys during tool execution", async () => {
    mockApi.pluginConfig.apiKey = {
      source: "env",
      provider: "default",
      id: "AITOEARN_API_KEY",
    };

    await pluginEntry.register(mockApi as any);

    const tool = registeredTools[0];
    await tool.execute("test-call-id", { input: "test" });

    expect(configRuntimeMock.resolveConfiguredSecretInputString).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "plugins.entries.aitoearn.config.apiKey",
        value: mockApi.pluginConfig.apiKey,
      })
    );
  });

  it("should return a text error when runtime API key resolution fails", async () => {
    configRuntimeMock.resolveConfiguredSecretInputString.mockResolvedValue({
      unresolvedRefReason: "Environment variable AITOEARN_API_KEY is missing",
    });

    await pluginEntry.register(mockApi as any);

    const tool = registeredTools[0];
    const result = await tool.execute("test-call-id", { input: "test" });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "AiToEarn plugin is not configured. Re-run setup and restart the gateway.",
        },
      ],
      details: null,
    });
  });

  it("should execute synced tool and return result", async () => {
    await pluginEntry.register(mockApi as any);

    const tool = registeredTools[0];
    const result = await tool.execute("test-call-id", { input: "test" });

    expect(result).toEqual({
      content: [{ type: "text", text: "test result" }],
      details: null,
    });
  });
});
