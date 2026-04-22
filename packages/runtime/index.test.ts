import { beforeEach, describe, expect, it, vi } from "vitest";

const configRuntimeMock = vi.hoisted(() => ({
  resolveConfiguredSecretInputString: vi.fn(),
}));

const toolDiscoveryMock = vi.hoisted(() => ({
  applySyncToolDiscoveryLogs: vi.fn(),
  loadToolDefinitionsSync: vi.fn(),
}));

const sharedMcpClientMock = vi.hoisted(() => ({
  callMcpTool: vi.fn().mockResolvedValue({
    content: [{ type: "text", text: "test result" }],
  }),
}));

const assetUploadMock = vi.hoisted(() => ({
  ASSET_TYPE_VALUES: ["temp", "userMedia"],
  uploadAssetFromPath: vi.fn(),
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn().mockImplementation(() => mcpClientMock),
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: vi.fn().mockImplementation(() => ({})),
}));

vi.mock("openclaw/plugin-sdk/plugin-entry", () => ({
  definePluginEntry: vi.fn((entry) => entry),
}));

vi.mock("openclaw/plugin-sdk/config-runtime", () => configRuntimeMock);
vi.mock("./src/tool-discovery.js", () => toolDiscoveryMock);
vi.mock("../shared/src/mcp-client.js", () => sharedMcpClientMock);
vi.mock("./src/asset-upload.js", () => assetUploadMock);

import pluginEntry from "./index.js";

interface RegisteredTool {
  name: string;
  description: string;
  execute: (...args: unknown[]) => Promise<unknown>;
}

function createTool(
  name: string,
  description = `Tool ${name}`,
  inputSchema: Record<string, unknown> = { type: "object", properties: {} }
) {
  return {
    name,
    description,
    inputSchema,
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
    sharedMcpClientMock.callMcpTool.mockReset();
    sharedMcpClientMock.callMcpTool.mockResolvedValue({
      content: [{ type: "text", text: "test result" }],
    });
    assetUploadMock.uploadAssetFromPath.mockReset();
    assetUploadMock.uploadAssetFromPath.mockResolvedValue({
      id: "asset-1",
      path: "temp/asset-1.png",
      url: "https://cdn.example.com/temp/asset-1.png",
      type: "temp",
      filename: "screenshot.png",
      size: 5,
      contentType: "image/png",
      filePath: "/tmp/screenshot.png",
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
      "uploadAssetFromPath",
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

  it("should append tool-specific minor-unit notes to money-related tools", async () => {
    setDiscoveredTools([
      "listTaskMarket",
      "getTaskDetail",
      "getAffiliateOverview",
      "getAffiliateSettlement",
      "acceptTask",
      "test_tool",
    ]);

    await pluginEntry.register(mockApi as any);

    expect(getRegisteredTool("listTaskMarket").description).toBe(
      "Tool listTaskMarket\n\nExcept for points, money-related values are returned in cents/fen-style minor units. Always interpret them with the response currency, not as major currency units. For task rewards, treat reward: 100 with currency: USD as 1 USD, and reward: 50 with currency: USD as 0.5 USD."
    );
    expect(getRegisteredTool("getTaskDetail").description).toBe(
      "Tool getTaskDetail\n\nExcept for points, money-related values are returned in cents/fen-style minor units. Always interpret them with the response currency, not as major currency units. For task rewards, treat reward: 100 with currency: USD as 1 USD, and reward: 50 with currency: USD as 0.5 USD."
    );
    expect(getRegisteredTool("getAffiliateOverview").description).toBe(
      "Tool getAffiliateOverview\n\nExcept for points, money-related values are returned in cents/fen-style minor units. Always interpret them with the response currency, not as major currency units. For affiliate and settlement fields such as pending, settled, total, amount, and commissionAmount, treat 1234 with currency: USD as 12.34 USD."
    );
    expect(getRegisteredTool("getAffiliateSettlement").description).toBe(
      "Tool getAffiliateSettlement\n\nExcept for points, money-related values are returned in cents/fen-style minor units. Always interpret them with the response currency, not as major currency units. For affiliate and settlement fields such as pending, settled, total, amount, and commissionAmount, treat 1234 with currency: USD as 12.34 USD."
    );
    expect(getRegisteredTool("acceptTask").description).toBe(
      "Tool acceptTask\n\nExcept for points, money-related values are returned in cents/fen-style minor units. Always interpret them with the response currency, not as major currency units. For deposit-style fields such as depositAmount, treat 500 with currency: USD as 5 USD."
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

  it("should execute uploadAssetFromPath with resolved plugin config", async () => {
    await pluginEntry.register(mockApi as any);

    const result = await getRegisteredTool("uploadAssetFromPath").execute(
      "test-call-id",
      {
        filePath: "./captures/screenshot.png",
        type: "temp",
        filename: "xhs-comment.png",
        contentType: "image/png",
      }
    );

    expect(assetUploadMock.uploadAssetFromPath).toHaveBeenCalledWith({
      apiKey: "test-api-key",
      baseUrl: "https://test.aitoearn.ai/api",
      filePath: "./captures/screenshot.png",
      type: "temp",
      filename: "xhs-comment.png",
      contentType: "image/png",
    });
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              id: "asset-1",
              path: "temp/asset-1.png",
              url: "https://cdn.example.com/temp/asset-1.png",
              type: "temp",
              filename: "screenshot.png",
              size: 5,
              contentType: "image/png",
              filePath: "/tmp/screenshot.png",
            },
            null,
            2
          ),
        },
      ],
      details: null,
    });
  });

  it("should sanitize non-required placeholder values before calling MCP", async () => {
    toolDiscoveryMock.loadToolDefinitionsSync.mockReturnValue({
      source: "remote",
      tools: [
        createTool("test_tool", "Tool test_tool", {
          type: "object",
          required: ["workLink"],
          properties: {
            workLink: { type: "string" },
            imgUrlList: {
              type: "array",
              items: { type: "string" },
            },
            shippingAddress: {
              type: "object",
              properties: {
                address1: { type: "string" },
                city: { type: "string" },
              },
            },
            zero: { type: "number" },
            flag: { type: "boolean" },
          },
        }),
      ],
      logs: [],
    });

    await pluginEntry.register(mockApi as any);

    await getRegisteredTool("test_tool").execute("test-call-id", {
      workLink: "https://real.example.com/work",
      imgUrlList: [
        "https://placeholder.invalid/remove-me",
        "https://cdn.example.com/image.jpg",
      ],
      shippingAddress: {
        address1: " ",
        city: " ",
      },
      zero: 0,
      flag: false,
      note: "placeholder",
    });

    expect(sharedMcpClientMock.callMcpTool).toHaveBeenCalledWith(
      "test-api-key",
      "https://test.aitoearn.ai/api",
      "test_tool",
      {
        workLink: "https://real.example.com/work",
        imgUrlList: ["https://cdn.example.com/image.jpg"],
        zero: 0,
        flag: false,
      }
    );
  });

  it("should preserve placeholder values for required fields", async () => {
    toolDiscoveryMock.loadToolDefinitionsSync.mockReturnValue({
      source: "remote",
      tools: [
        createTool("test_tool", "Tool test_tool", {
          type: "object",
          required: ["imgUrlList", "payload"],
          properties: {
            imgUrlList: {
              type: "array",
              items: { type: "string" },
            },
            payload: {
              type: "object",
              required: ["workLink"],
              properties: {
                workLink: { type: "string" },
                caption: { type: "string" },
              },
            },
          },
        }),
      ],
      logs: [],
    });

    await pluginEntry.register(mockApi as any);

    await getRegisteredTool("test_tool").execute("test-call-id", {
      imgUrlList: ["https://placeholder.invalid/remove-me"],
      payload: {
        workLink: "https://placeholder.invalid/remove-me",
        caption: " ",
      },
    });

    expect(sharedMcpClientMock.callMcpTool).toHaveBeenCalledWith(
      "test-api-key",
      "https://test.aitoearn.ai/api",
      "test_tool",
      {
        imgUrlList: ["https://placeholder.invalid/remove-me"],
        payload: {
          workLink: "https://placeholder.invalid/remove-me",
        },
      }
    );
  });

  it("should strip blank optional params inside composed schemas before calling MCP", async () => {
    toolDiscoveryMock.loadToolDefinitionsSync.mockReturnValue({
      source: "remote",
      tools: [
        createTool("test_tool", "Tool test_tool", {
          type: "object",
          allOf: [
            {
              properties: {
                accountId: {
                  anyOf: [{ type: "string" }, { type: "null" }],
                },
                opportunityId: {
                  oneOf: [{ type: "string" }, { type: "null" }],
                },
              },
            },
          ],
          properties: {
            materialId: { type: "string" },
            shippingAddress: {
              anyOf: [
                {
                  type: "object",
                  required: ["firstName", "address1"],
                  properties: {
                    firstName: { type: "string" },
                    lastName: { type: "string" },
                    address1: { type: "string" },
                    address2: { type: "string" },
                    city: { type: "string" },
                    province: { type: "string" },
                    country: { type: "string" },
                    zip: { type: "string" },
                    phone: { type: "string" },
                  },
                },
                { type: "null" },
              ],
            },
            workLink: { type: "string" },
          },
        }),
      ],
      logs: [],
    });

    await pluginEntry.register(mockApi as any);

    await getRegisteredTool("test_tool").execute("test-call-id", {
      accountId: " ",
      opportunityId: " ",
      materialId: " ",
      shippingAddress: {
        firstName: " ",
        lastName: " ",
        address1: " ",
        address2: " ",
        city: " ",
        province: " ",
        country: " ",
        zip: " ",
        phone: " ",
      },
      workLink: "https://real.example.com/work",
    });

    expect(sharedMcpClientMock.callMcpTool).toHaveBeenCalledWith(
      "test-api-key",
      "https://test.aitoearn.ai/api",
      "test_tool",
      {
        workLink: "https://real.example.com/work",
      }
    );
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
      "uploadAssetFromPath",
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
      "uploadAssetFromPath",
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
