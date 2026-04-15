import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { resolveConfiguredSecretInputString } from "openclaw/plugin-sdk/config-runtime";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as p from "@clack/prompts";
import { getMcpClient } from "./src/mcp-client.js";
import {
  buildPluginEntryConfig,
  configSchema,
  getPublishPlatformPolicy,
  getPublishToolPlatform,
  normalizeBaseUrl,
  PLUGIN_ID,
  PLUGIN_NAME,
  resolveAiToEarnEnvironment,
  type PluginConfig,
} from "./src/plugin-config.js";
import { runInteractiveSetupFlow } from "./src/setup-flow.js";
import {
  applySyncToolDiscoveryLogs,
  loadToolDefinitionsSync,
} from "./src/tool-discovery.js";
import type { ToolDefinition } from "./src/tools.js";

export default definePluginEntry({
  id: PLUGIN_ID,
  name: PLUGIN_NAME,
  description: "AiToEarn social media management tools",
  configSchema,

  register(api) {
    api.registerCli(
      ({ program }) => {
        program
          .command(PLUGIN_ID)
          .description("AiToEarn plugin management")
          .command("setup")
          .description("Configure AiToEarn plugin with your API key (deprecated)")
          .action(async () => runSetup(api));
      },
      {
        descriptors: [
          { name: PLUGIN_ID, description: "AiToEarn plugin", hasSubcommands: true },
        ],
      }
    );

    const parsed = configSchema.safeParse(api.pluginConfig ?? {});
    const pluginConfig = (parsed.success ? parsed.data : {}) as PluginConfig;
    const baseUrl = normalizeBaseUrl(pluginConfig.baseUrl);
    const environment = resolveAiToEarnEnvironment(baseUrl);
    const discoveryResult = loadToolDefinitionsSync({
      config: api.config,
      pluginConfig,
      stateDir: api.runtime.state.resolveStateDir(),
    });

    applySyncToolDiscoveryLogs(api.logger, discoveryResult.logs);

    const discoveredPublishPlatforms = sortUnique(
      discoveryResult.tools
        .map((tool) => getPublishToolPlatform(tool.name))
        .filter((value): value is string => Boolean(value))
    );
    const policyPlatforms =
      environment === "self_hosted"
        ? [...discoveredPublishPlatforms]
        : getPublishPlatformPolicy(environment);
    const policyPlatformSet = new Set(policyPlatforms);
    const filteredTools = discoveryResult.tools.filter((tool) =>
      shouldRegisterTool(tool, environment, policyPlatformSet)
    );
    const registeredPublishPlatforms = sortUnique(
      filteredTools
        .map((tool) => getPublishToolPlatform(tool.name))
        .filter((value): value is string => Boolean(value))
    );
    const policyButMissingPublishPlatforms =
      environment === "self_hosted"
        ? []
        : policyPlatforms.filter(
            (platform) => !discoveredPublishPlatforms.includes(platform)
          );
    const unsupportedPublishPlatforms =
      environment === "self_hosted"
        ? []
        : discoveredPublishPlatforms.filter(
            (platform) => !policyPlatformSet.has(platform)
          );

    api.registerTool({
      name: "getAiToEarnEnvironment",
      label: "getAiToEarnEnvironment",
      description:
        "Get the current AiToEarn runtime environment, publish platform policy, and registered publish tools derived from the configured baseUrl.",
      parameters: {
        type: "object",
        properties: {},
      },
      async execute() {
        return {
          content: [
            {
              type: "text" as const,
              text: formatEnvironmentSummary({
                baseUrl,
                environment,
                policyPlatforms,
                registeredPublishPlatforms,
                policyButMissingPublishPlatforms,
                unsupportedPublishPlatforms,
              }),
            },
          ],
          details: null,
        };
      },
    });

    for (const tool of filteredTools) {
      const publishPlatform = getPublishToolPlatform(tool.name);
      api.registerTool({
        name: tool.name,
        label: tool.name,
        description: describeTool(tool.description, environment, publishPlatform),
        parameters: tool.inputSchema,
        async execute(_toolCallId, params) {
          const config = await resolvePluginConfig(api);
          if (!config) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "AiToEarn plugin is not configured. Re-run setup and restart the gateway.",
                },
              ],
              details: null,
            };
          }

          const client = await getMcpClient(config.apiKey, config.baseUrl);
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
  const setupResult = await runInteractiveSetupFlow({
    compatibilityNote:
      'This command is deprecated. Prefer `npx @aitoearn/openclaw-plugin` for future setup.',
  });
  if (setupResult.status === "cancelled") {
    return;
  }

  if (setupResult.status === "validation_failed") {
    process.exitCode = 1;
    return;
  }

  const cfg = api.runtime.config.loadConfig();
  cfg.plugins ??= {};
  cfg.plugins.entries ??= {};
  cfg.plugins.entries[PLUGIN_ID] = buildPluginEntryConfig(setupResult.config);
  await api.runtime.config.writeConfigFile(cfg);

  p.outro('Configuration saved! Run "openclaw gateway restart" to apply.');
}

async function resolvePluginConfig(
  api: OpenClawPluginApi
): Promise<{ apiKey: string; baseUrl: string } | null> {
  const parsed = configSchema.safeParse(api.pluginConfig ?? {});
  const config = (parsed.success ? parsed.data : {}) as PluginConfig;
  if (!config.apiKey) {
    return null;
  }

  const apiKeyResolution = await resolveConfiguredSecretInputString({
    config: api.config,
    env: process.env,
    value: config.apiKey,
    path: `plugins.entries.${PLUGIN_ID}.config.apiKey`,
    unresolvedReasonStyle: "detailed",
  });

  const apiKey = apiKeyResolution.value?.trim();
  if (!apiKey) {
    api.logger.warn(
      `AiToEarn plugin disabled: ${
        apiKeyResolution.unresolvedRefReason ??
        `plugins.entries.${PLUGIN_ID}.config.apiKey is not configured.`
      }`
    );
    return null;
  }

  return {
    apiKey,
    baseUrl: normalizeBaseUrl(config.baseUrl),
  };
}

function shouldRegisterTool(
  tool: ToolDefinition,
  environment: ReturnType<typeof resolveAiToEarnEnvironment>,
  policyPlatformSet: Set<string>
): boolean {
  const publishPlatform = getPublishToolPlatform(tool.name);
  if (!publishPlatform) {
    return true;
  }

  if (environment === "self_hosted") {
    return true;
  }

  return policyPlatformSet.has(publishPlatform);
}

function describeTool(
  description: string,
  environment: ReturnType<typeof resolveAiToEarnEnvironment>,
  publishPlatform: string | null
): string {
  if (!publishPlatform || environment === "self_hosted") {
    return description;
  }

  const envLabel = environment === "china" ? "China" : "Global";
  return `AiToEarn ${envLabel} publish tool. ${description}`;
}

function formatEnvironmentSummary(params: {
  baseUrl: string;
  environment: ReturnType<typeof resolveAiToEarnEnvironment>;
  policyPlatforms: string[];
  registeredPublishPlatforms: string[];
  policyButMissingPublishPlatforms: string[];
  unsupportedPublishPlatforms: string[];
}): string {
  return [
    `Environment: ${params.environment}`,
    `Base URL: ${params.baseUrl}`,
    `Policy Platforms: ${formatList(params.policyPlatforms)}`,
    `Registered Publish Platforms: ${formatList(params.registeredPublishPlatforms)}`,
    `Policy But Missing Publish Platforms: ${formatList(
      params.policyButMissingPublishPlatforms
    )}`,
    `Unsupported Publish Platforms: ${formatList(
      params.unsupportedPublishPlatforms
    )}`,
  ].join("\n");
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}

function sortUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
