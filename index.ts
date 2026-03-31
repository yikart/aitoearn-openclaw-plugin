import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import * as p from "@clack/prompts";
import { getMcpClient } from "./src/mcp-client.js";
import { toolDefinitions } from "./src/tools.js";

const configSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().default("https://aitoearn.ai/api"),
});

type PluginConfig = z.infer<typeof configSchema>;

export default definePluginEntry({
  id: "aitoearn",
  name: "AiToEarn",
  description: "AiToEarn social media management tools",
  configSchema,

  register(api) {
    // 注册 CLI 命令
    api.registerCli(
      ({ program }) => {
        program
          .command("aitoearn")
          .description("AiToEarn plugin management")
          .command("setup")
          .description("Configure AiToEarn plugin with your API key")
          .action(() => runSetup(api));
      },
      {
        descriptors: [
          { name: "aitoearn", description: "AiToEarn plugin", hasSubcommands: true },
        ],
      }
    );

    const config = api.pluginConfig as PluginConfig;

    if (!config.apiKey) {
      return;
    }

    const baseUrl = config.baseUrl || "https://aitoearn.ai/api";
    const apiKey = config.apiKey;

    // 同步注册所有工具（硬编码定义）
    for (const tool of toolDefinitions) {
      api.registerTool({
        name: tool.name,
        label: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
        async execute(_toolCallId, params) {
          const client = await getMcpClient(apiKey, baseUrl);
          const result = (await client.callTool({
            name: tool.name,
            arguments: params as Record<string, unknown>,
          })) as CallToolResult;
          return {
            content: result.content.map((c) =>
              c.type === "text"
                ? { type: "text" as const, text: c.text }
                : c.type === "image"
                  ? { type: "image" as const, data: c.data, mimeType: c.mimeType }
                  : { type: "text" as const, text: JSON.stringify(c) }
            ),
            details: null,
          };
        },
      });
    }
  },
});

async function runSetup(api: OpenClawPluginApi): Promise<void> {
  p.intro("AiToEarn Plugin Setup");

  const apiKey = await p.text({
    message: "Enter your API Key:",
    validate: (value) => {
      if (!value) return "API Key is required";
    },
  });

  if (p.isCancel(apiKey)) {
    p.cancel("Setup cancelled");
    process.exit(0);
  }

  const environment = await p.select({
    message: "Select environment:",
    options: [
      {
        value: "prod",
        label: "Production (aitoearn.ai)",
        hint: "International",
      },
      {
        value: "prod-cn",
        label: "Production China (aitoearn.cn)",
        hint: "China region",
      },
      { value: "custom", label: "Custom URL", hint: "Self-hosted" },
    ],
  });

  if (p.isCancel(environment)) {
    p.cancel("Setup cancelled");
    process.exit(0);
  }

  let baseUrl: string;
  if (environment === "prod-cn") {
    baseUrl = "https://aitoearn.cn/api";
  } else if (environment === "custom") {
    const customUrl = await p.text({
      message: "Enter custom base URL:",
      placeholder: "https://your-domain.com/api",
      validate: (value) => {
        if (!value) return "Base URL is required";
      },
    });

    if (p.isCancel(customUrl)) {
      p.cancel("Setup cancelled");
      process.exit(0);
    }

    baseUrl = customUrl as string;
  } else {
    baseUrl = "https://aitoearn.ai/api";
  }

  const s = p.spinner();
  s.start("Validating API Key...");

  const validationResult = await validateWithMcpClient(
    apiKey as string,
    baseUrl
  );
  if (!validationResult.success) {
    s.stop();
    p.cancel(`Validation failed: ${validationResult.error}`);
    process.exit(1);
  }

  s.stop(`Connected! Found ${validationResult.toolCount} tools.`);

  // 使用 OpenClaw 的配置 API 写入
  const cfg = api.runtime.config.loadConfig();
  cfg.plugins ??= {};
  cfg.plugins.entries ??= {};
  cfg.plugins.entries.aitoearn = {
    enabled: true,
    config: { apiKey, baseUrl },
  };
  await api.runtime.config.writeConfigFile(cfg);

  p.outro('Configuration saved! Run "openclaw gateway restart" to apply.');
}

async function validateWithMcpClient(
  apiKey: string,
  baseUrl: string
): Promise<{ success: true; toolCount: number } | { success: false; error: string }> {
  try {
    const client = await getMcpClient(apiKey, baseUrl);
    const { tools } = await client.listTools();
    return { success: true, toolCount: tools.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
