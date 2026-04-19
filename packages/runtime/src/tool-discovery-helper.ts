import { fileURLToPath } from "node:url";
import path from "node:path";
import { listMcpTools } from "../../shared/src/mcp-client.js";
import {
  configSchema,
  normalizeBaseUrl,
  PLUGIN_ID,
  type PluginConfig,
} from "../../shared/src/plugin-config.js";
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
  resolveConfiguredSecretInputString: (
    params: Record<string, unknown>
  ) => Promise<{
      value?: string;
      unresolvedRefReason?: string;
  }>;
  listMcpTools: typeof listMcpTools;
}

export async function runToolDiscoveryHelper(
  payload: ToolDiscoveryHelperPayload,
  deps: ToolDiscoveryHelperDeps
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
    const result = await deps.listMcpTools(
      apiKey,
      normalizeBaseUrl(pluginConfig.baseUrl)
    );
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

  const result = await runToolDiscoveryHelper(payload, {
    env: process.env,
    listMcpTools,
    resolveConfiguredSecretInputString:
      await loadResolveConfiguredSecretInputString(),
  });
  process.stdout.write(JSON.stringify(result));
}

async function loadResolveConfiguredSecretInputString(): Promise<
  ToolDiscoveryHelperDeps["resolveConfiguredSecretInputString"]
> {
  const specifier = resolveConfigRuntimeModuleSpecifier();
  const configRuntimeModule = await import(specifier);
  const resolveConfiguredSecretInputString =
    configRuntimeModule.resolveConfiguredSecretInputString;

  if (typeof resolveConfiguredSecretInputString !== "function") {
    throw new Error(
      `Failed to load resolveConfiguredSecretInputString from ${specifier}.`
    );
  }

  return resolveConfiguredSecretInputString as ToolDiscoveryHelperDeps["resolveConfiguredSecretInputString"];
}

function resolveConfigRuntimeModuleSpecifier(): string {
  if (typeof import.meta.resolve === "function") {
    try {
      return import.meta.resolve("openclaw/plugin-sdk/config-runtime");
    } catch {
      return "openclaw/plugin-sdk/config-runtime";
    }
  }

  return "openclaw/plugin-sdk/config-runtime";
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
