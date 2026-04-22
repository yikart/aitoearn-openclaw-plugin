import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { resolveConfiguredSecretInputString } from "openclaw/plugin-sdk/config-runtime";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as p from "@clack/prompts";
import { callMcpTool } from "../shared/src/mcp-client.js";
import {
  buildPluginEntryConfig,
  configSchema,
  getPublishPlatformPolicy,
  getPublishToolPlatform,
  INSTALLER_PACKAGE_NAME,
  normalizeBaseUrl,
  PLUGIN_ID,
  PLUGIN_NAME,
  resolveAiToEarnEnvironment,
  type PluginConfig,
} from "../shared/src/plugin-config.js";
import { runInteractiveSetupFlow } from "../shared/src/setup-flow.js";
import {
  applySyncToolDiscoveryLogs,
  loadToolDefinitionsSync,
} from "./src/tool-discovery.js";
import {
  ASSET_TYPE_VALUES,
  uploadAssetFromPath,
} from "./src/asset-upload.js";
import { sanitizeToolParams } from "./src/tool-params.js";
import type { ToolDefinition } from "./src/tools.js";

const MONEY_RELATED_TOOL_NAMES = new Set([
  "acceptTask",
  "getAffiliateOverview",
  "getAffiliateSettlement",
  "getMySampleOrderDetail",
  "getTaskDetail",
  "listAffiliateCommissions",
  "listMySampleOrders",
  "listTaskMarket",
]);

const TASK_REWARD_TOOL_NAMES = new Set(["getTaskDetail", "listTaskMarket"]);
const AFFILIATE_AMOUNT_TOOL_NAMES = new Set([
  "getAffiliateOverview",
  "getAffiliateSettlement",
  "listAffiliateCommissions",
]);
const DEPOSIT_AMOUNT_TOOL_NAMES = new Set([
  "acceptTask",
  "getMySampleOrderDetail",
  "listMySampleOrders",
]);

const GENERIC_MONEY_UNITS_NOTE =
  "Except for points, money-related values are returned in cents/fen-style minor units. Always interpret them with the response currency, not as major currency units.";
const TASK_REWARD_NOTE =
  `${GENERIC_MONEY_UNITS_NOTE} For task rewards, treat reward: 100 with currency: USD as 1 USD, and reward: 50 with currency: USD as 0.5 USD.`;
const AFFILIATE_AMOUNT_NOTE =
  `${GENERIC_MONEY_UNITS_NOTE} For affiliate and settlement fields such as pending, settled, total, amount, and commissionAmount, treat 1234 with currency: USD as 12.34 USD.`;
const DEPOSIT_AMOUNT_NOTE =
  `${GENERIC_MONEY_UNITS_NOTE} For deposit-style fields such as depositAmount, treat 500 with currency: USD as 5 USD.`;

const UPLOAD_ASSET_FROM_PATH_TOOL_NAME = "uploadAssetFromPath";
const UPLOAD_ASSET_FROM_PATH_TOOL_DESCRIPTION =
  "Read a local file from filePath, create an AiToEarn asset upload signature, upload the file via signed PUT, confirm the upload, and return the confirmed asset metadata.";
const UPLOAD_ASSET_FROM_PATH_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: ["filePath"],
  properties: {
    filePath: {
      type: "string",
      description:
        "Local file path to upload. Supports absolute paths and relative paths resolved from the current working directory.",
    },
    type: {
      type: "string",
      enum: [...ASSET_TYPE_VALUES],
      description: 'AiToEarn asset type. Defaults to "temp".',
    },
    filename: {
      type: "string",
      description:
        "Optional upload filename. Defaults to the basename of filePath.",
    },
    contentType: {
      type: "string",
      description:
        "Optional MIME type override. Defaults to a value inferred from the filename extension.",
    },
  },
} as const;

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

    api.registerTool({
      name: UPLOAD_ASSET_FROM_PATH_TOOL_NAME,
      label: UPLOAD_ASSET_FROM_PATH_TOOL_NAME,
      description: UPLOAD_ASSET_FROM_PATH_TOOL_DESCRIPTION,
      parameters: UPLOAD_ASSET_FROM_PATH_PARAMETERS,
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

        const input = isRecord(params) ? params : {};
        const result = await uploadAssetFromPath({
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          filePath: typeof input.filePath === "string" ? input.filePath : "",
          type: typeof input.type === "string" ? input.type : undefined,
          filename:
            typeof input.filename === "string" ? input.filename : undefined,
          contentType:
            typeof input.contentType === "string"
              ? input.contentType
              : undefined,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
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
        description: describeTool(tool, environment, publishPlatform),
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

          const result = (await callMcpTool(
            config.apiKey,
            config.baseUrl,
            tool.name,
            sanitizeToolParams(
              isRecord(params) ? params : {},
              tool.inputSchema
            )
          )) as CallToolResult;
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
      `This command is deprecated. Prefer \`npx ${INSTALLER_PACKAGE_NAME}\` for future setup.`,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describeTool(
  tool: ToolDefinition,
  environment: ReturnType<typeof resolveAiToEarnEnvironment>,
  publishPlatform: string | null
): string {
  let description = tool.description;

  if (!publishPlatform || environment === "self_hosted") {
    return appendMoneyUnitsNote(tool.name, description);
  }

  const envLabel = environment === "china" ? "China" : "Global";
  description = `AiToEarn ${envLabel} publish tool. ${description}`;
  return appendMoneyUnitsNote(tool.name, description);
}

function appendMoneyUnitsNote(toolName: string, description: string): string {
  if (!MONEY_RELATED_TOOL_NAMES.has(toolName)) {
    return description;
  }

  const note = resolveMoneyUnitsNote(toolName);
  return description.trim()
    ? `${description}\n\n${note}`
    : note;
}

function resolveMoneyUnitsNote(toolName: string): string {
  if (TASK_REWARD_TOOL_NAMES.has(toolName)) {
    return TASK_REWARD_NOTE;
  }

  if (AFFILIATE_AMOUNT_TOOL_NAMES.has(toolName)) {
    return AFFILIATE_AMOUNT_NOTE;
  }

  if (DEPOSIT_AMOUNT_TOOL_NAMES.has(toolName)) {
    return DEPOSIT_AMOUNT_NOTE;
  }

  return GENERIC_MONEY_UNITS_NOTE;
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
