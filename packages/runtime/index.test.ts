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

interface RegisteredTool {
  name: string;
  description: string;
  execute: (...args: unknown[]) => Promise<unknown>;
}

function createTool(name: string, description = `Tool ${name}`) {
  return {
    name,
    description,
    inputSchema: { type: "object", properties: {} },
  };
}

describe("AiToEarn OpenClaw Plugin", () => {
  let registeredTools: RegisteredTool[];
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

  function setDiscoveredTools(toolNames: string[]) {
    toolDiscoveryMock.loadToolDefinitionsSync.mockReturnValue({
      source: "remote",
      tools: toolNames.map((name) => createTool(name)),
      logs: [],
    });
  }

  function getRegisteredTool(name: string): RegisteredTool {
    const tool = registeredTools.find((candidate) => candidate.name === name);
    expect(tool).toBeDefined();
    return tool!;
  }

  function getRegisteredToolNames(): string[] {
    return registeredTools.map((tool) => tool.name);
  }

  beforeEach(() => {
    registeredTools = [];
    configRuntimeMock.resolveConfiguredSecretInputString.mockReset();
    configRuntimeMock.resolveConfiguredSecretInputString.mockResolvedValue({
      value: "test-api-key",
    });
    toolDiscoveryMock.applySyncToolDiscoveryLogs.mockReset();
    toolDiscoveryMock.loadToolDefinitionsSync.mockReset();
    setDiscoveredTools([
      "test_tool",
      "publishPostToTiktok",
      "publishPostToKwai",
      "publishPostToWxGzh",
      "publishPostToBilibili",
    ]);

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

  it("should register CLI, environment tool, and filtered global publish tools", async () => {
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
    expect(getRegisteredToolNames()).toEqual([
      "getAiToEarnEnvironment",
      "test_tool",
      "publishPostToTiktok",
    ]);
    expect(getRegisteredTool("publishPostToTiktok").description).toBe(
      "AiToEarn Global publish tool. Tool publishPostToTiktok"
    );
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

    const result = (await getRegisteredTool("getAiToEarnEnvironment").execute(
      "test-call-id",
      {}
    )) as {
      content: Array<{ type: string; text: string }>;
      details: null;
    };

    expect(result.content[0].text).toContain("Environment: global");
    expect(result.content[0].text).toContain("Base URL: https://aitoearn.ai/api");
  });

  it("should append minor-unit notes to money-related tools", async () => {
    setDiscoveredTools(["listTaskMarket", "getAffiliateSettlement", "test_tool"]);

    await pluginEntry.register(mockApi as any);

    expect(getRegisteredTool("listTaskMarket").description).toBe(
      "Tool listTaskMarket\n\nMoney amounts are returned in minor units (such as cents). Use the response currency field when interpreting them. Points and other non-money counters stay in raw values."
    );
    expect(getRegisteredTool("getAffiliateSettlement").description).toBe(
      "Tool getAffiliateSettlement\n\nMoney amounts are returned in minor units (such as cents). Use the response currency field when interpreting them. Points and other non-money counters stay in raw values."
    );
    expect(getRegisteredTool("test_tool").description).toBe("Tool test_tool");
  });

  it("should resolve SecretRef API keys during synced tool execution", async () => {
    mockApi.pluginConfig.apiKey = {
      source: "env",
      provider: "default",
      id: "AITOEARN_API_KEY",
    };

    await pluginEntry.register(mockApi as any);

    await getRegisteredTool("test_tool").execute("test-call-id", { input: "test" });

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

    const result = await getRegisteredTool("test_tool").execute("test-call-id", {
      input: "test",
    });

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

    const result = await getRegisteredTool("test_tool").execute("test-call-id", {
      input: "test",
    });

    expect(result).toEqual({
      content: [{ type: "text", text: "test result" }],
      details: null,
    });
  });

  it("should keep only China publish tools for China environment", async () => {
    setDiscoveredTools([
      "test_tool",
      "publishPostToDouyin",
      "publishPostToKwai",
      "publishPostToBilibili",
      "publishPostToWxGzh",
      "publishPostToTiktok",
      "publishPostToTwitter",
    ]);
    mockApi.pluginConfig.baseUrl = "https://aitoearn.cn/api";

    await pluginEntry.register(mockApi as any);

    expect(getRegisteredToolNames()).toEqual([
      "getAiToEarnEnvironment",
      "test_tool",
      "publishPostToDouyin",
      "publishPostToKwai",
      "publishPostToBilibili",
      "publishPostToWxGzh",
    ]);
    expect(getRegisteredTool("publishPostToDouyin").description).toBe(
      "AiToEarn China publish tool. Tool publishPostToDouyin"
    );
  });

  it("should keep all discovered publish tools for self-hosted environments", async () => {
    setDiscoveredTools([
      "test_tool",
      "publishPostToKwai",
      "publishPostToTiktok",
      "publishPostToWxGzh",
    ]);
    mockApi.pluginConfig.baseUrl = "https://example.internal/api";

    await pluginEntry.register(mockApi as any);

    expect(getRegisteredToolNames()).toEqual([
      "getAiToEarnEnvironment",
      "test_tool",
      "publishPostToKwai",
      "publishPostToTiktok",
      "publishPostToWxGzh",
    ]);
    expect(getRegisteredTool("publishPostToTiktok").description).toBe(
      "Tool publishPostToTiktok"
    );
  });

  it("should report global environment policy and unsupported discovered platforms", async () => {
    setDiscoveredTools([
      "test_tool",
      "publishPostToTiktok",
      "publishPostToYoutube",
      "publishPostToKwai",
      "publishPostToWxGzh",
      "publishPostToBilibili",
    ]);
    mockApi.pluginConfig.baseUrl = "https://dev.aitoearn.ai/api";

    await pluginEntry.register(mockApi as any);

    const result = (await getRegisteredTool("getAiToEarnEnvironment").execute(
      "test-call-id",
      {}
    )) as {
      content: Array<{ type: string; text: string }>;
      details: null;
    };

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: [
            "Environment: global",
            "Base URL: https://dev.aitoearn.ai/api",
            "Policy Platforms: tiktok, youtube, twitter, facebook, instagram, threads, pinterest, linkedin",
            "Registered Publish Platforms: tiktok, youtube",
            "Policy But Missing Publish Platforms: twitter, facebook, instagram, threads, pinterest, linkedin",
            "Unsupported Publish Platforms: KWAI, bilibili, wxGzh",
          ].join("\n"),
        },
      ],
      details: null,
    });
  });

  it("should report discovered publish tools as policy for self-hosted environments", async () => {
    setDiscoveredTools([
      "test_tool",
      "publishPostToTiktok",
      "publishPostToWxGzh",
      "publishPostToKwai",
    ]);
    mockApi.pluginConfig.baseUrl = "https://example.internal/api";

    await pluginEntry.register(mockApi as any);

    const result = (await getRegisteredTool("getAiToEarnEnvironment").execute(
      "test-call-id",
      {}
    )) as {
      content: Array<{ type: string; text: string }>;
      details: null;
    };

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: [
            "Environment: self_hosted",
            "Base URL: https://example.internal/api",
            "Policy Platforms: KWAI, tiktok, wxGzh",
            "Registered Publish Platforms: KWAI, tiktok, wxGzh",
            "Policy But Missing Publish Platforms: none",
            "Unsupported Publish Platforms: none",
          ].join("\n"),
        },
      ],
      details: null,
    });
  });
});
