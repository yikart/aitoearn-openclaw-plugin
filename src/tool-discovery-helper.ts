import { resolveConfiguredSecretInputString } from "openclaw/plugin-sdk/config-runtime";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getMcpClient } from "./mcp-client.js";
import {
  configSchema,
  normalizeBaseUrl,
  PLUGIN_ID,
  type PluginConfig,
} from "./plugin-config.js";
import {
  sanitizeToolDefinitions,
  type ToolDiscoveryHelperResult,
} from "./tools.js";

export interface ToolDiscoveryHelperPayload {
  config: Record<string, unknown>;
  pluginConfig?: unknown;
}

interface ToolDiscoveryHelperDeps {
  env: NodeJS.ProcessEnv;
  resolveConfiguredSecretInputString: typeof resolveConfiguredSecretInputString;
  getMcpClient: typeof getMcpClient;
}

export async function runToolDiscoveryHelper(
  payload: ToolDiscoveryHelperPayload,
  deps: ToolDiscoveryHelperDeps = {
    env: process.env,
    resolveConfiguredSecretInputString,
    getMcpClient,
  }
): Promise<ToolDiscoveryHelperResult> {
  const parsed = configSchema.safeParse(payload.pluginConfig ?? {});
  const pluginConfig = (parsed.success ? parsed.data : {}) as PluginConfig;

  if (!pluginConfig.apiKey) {
    return { status: "not_configured" };
  }

  const apiKeyResolution = await deps.resolveConfiguredSecretInputString({
    config: payload.config as never,
    env: deps.env,
    value: pluginConfig.apiKey,
    path: `plugins.entries.${PLUGIN_ID}.config.apiKey`,
    unresolvedReasonStyle: "detailed",
  });

  const apiKey = apiKeyResolution.value?.trim();
  if (!apiKey) {
    return {
      status: "config_error",
      message:
        apiKeyResolution.unresolvedRefReason ??
        `plugins.entries.${PLUGIN_ID}.config.apiKey is not configured.`,
    };
  }

  try {
    const client = await deps.getMcpClient(
      apiKey,
      normalizeBaseUrl(pluginConfig.baseUrl)
    );
    const result = await client.listTools();
    const sanitized = sanitizeToolDefinitions(result.tools);

    return {
      status: "ok",
      tools: sanitized.tools,
      invalidCount: sanitized.invalidCount,
      duplicateCount: sanitized.duplicateCount,
    };
  } catch (error) {
    return {
      status: "sync_error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function readStdin(): Promise<string> {
  let input = "";

  for await (const chunk of process.stdin) {
    input += chunk.toString();
  }

  return input;
}

async function main(): Promise<void> {
  const raw = await readStdin();

  let payload: ToolDiscoveryHelperPayload;
  try {
    payload = JSON.parse(raw) as ToolDiscoveryHelperPayload;
  } catch (error) {
    process.stdout.write(
      JSON.stringify({
        status: "config_error",
        message:
          error instanceof Error
            ? `Invalid helper payload: ${error.message}`
            : "Invalid helper payload.",
      } satisfies ToolDiscoveryHelperResult)
    );
    return;
  }

  const result = await runToolDiscoveryHelper(payload);
  process.stdout.write(JSON.stringify(result));
}

const currentFilePath = fileURLToPath(import.meta.url);
if (process.argv[1] && currentFilePath === path.resolve(process.argv[1])) {
  void main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(
      JSON.stringify({
        status: "sync_error",
        message,
      } satisfies ToolDiscoveryHelperResult)
    );
  });
}
