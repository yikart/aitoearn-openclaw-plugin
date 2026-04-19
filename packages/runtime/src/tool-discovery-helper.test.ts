import { beforeEach, describe, expect, it, vi } from "vitest";
import { runToolDiscoveryHelper } from "./tool-discovery-helper.js";

describe("runToolDiscoveryHelper", () => {
  const resolveConfiguredSecretInputString = vi.fn();
  const listMcpTools = vi.fn();

  beforeEach(() => {
    resolveConfiguredSecretInputString.mockReset();
    listMcpTools.mockReset();
  });

  it("returns not_configured when apiKey is missing", async () => {
    const result = await runToolDiscoveryHelper(
      {
        config: {},
        pluginConfig: {},
      },
      {
        env: {},
        resolveConfiguredSecretInputString,
        listMcpTools,
      }
    );

    expect(result).toEqual({ status: "not_configured" });
    expect(resolveConfiguredSecretInputString).not.toHaveBeenCalled();
  });

  it("returns config_error when secret resolution fails", async () => {
    resolveConfiguredSecretInputString.mockResolvedValue({
      unresolvedRefReason: "Missing AITOEARN_API_KEY",
    });

    const result = await runToolDiscoveryHelper(
      {
        config: {},
        pluginConfig: {
          apiKey: { source: "env", provider: "default", id: "AITOEARN_API_KEY" },
        },
      },
      {
        env: {},
        resolveConfiguredSecretInputString,
        listMcpTools,
      }
    );

    expect(result).toEqual({
      status: "config_error",
      message: "Missing AITOEARN_API_KEY",
    });
  });

  it("fetches and sanitizes remote tools", async () => {
    resolveConfiguredSecretInputString.mockResolvedValue({
      value: "test-api-key",
    });
    listMcpTools.mockResolvedValue({
      tools: [
        {
          name: "remote_tool",
          description: "Remote",
          inputSchema: {
            id: "create-video-draft",
            type: "object",
            properties: {
              payload: {
                id: "video-payload",
                type: "object",
                properties: {
                  id: {
                    type: "string",
                  },
                },
              },
              time: {
                type: "array",
                items: [
                  {
                    type: "string",
                    format: "date-time",
                  },
                  {
                    type: "string",
                    format: "date-time",
                  },
                ],
              },
            },
          },
        },
        {
          name: "remote_tool",
          description: "Duplicate",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "",
          inputSchema: {},
        },
      ],
    });

    const result = await runToolDiscoveryHelper(
      {
        config: {},
        pluginConfig: {
          apiKey: "test-api-key",
          baseUrl: "https://aitoearn.ai/api/",
        },
      },
      {
        env: {},
        resolveConfiguredSecretInputString,
        listMcpTools,
      }
    );

    expect(listMcpTools).toHaveBeenCalledWith(
      "test-api-key",
      "https://aitoearn.ai/api"
    );
    expect(result).toEqual({
      status: "ok",
      tools: [
        {
          name: "remote_tool",
          description: "Remote",
          inputSchema: {
            $id: "create-video-draft",
            type: "object",
            properties: {
              payload: {
                $id: "video-payload",
                type: "object",
                properties: {
                  id: {
                    type: "string",
                  },
                },
              },
              time: {
                type: "array",
                items: {
                  type: "string",
                  format: "date-time",
                },
                minItems: 2,
                maxItems: 2,
              },
            },
          },
        },
      ],
      invalidCount: 1,
      duplicateCount: 1,
    });
  });
});
