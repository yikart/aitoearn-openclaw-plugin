import { z } from "zod";

export const PLUGIN_ID = "aitoearn";
export const PLUGIN_NAME = "AiToEarn";
export const PACKAGE_NAME = "@aitoearn/openclaw-plugin";
export const DEFAULT_BASE_URL = "https://aitoearn.ai/api";
export const CHINA_BASE_URL = "https://aitoearn.cn/api";

const secretInputSchema = z.union([
  z.string(),
  z.record(z.string(), z.unknown()),
]);

export const configSchema = z.object({
  apiKey: secretInputSchema.optional(),
  baseUrl: z.string().default(DEFAULT_BASE_URL),
});

export type PluginConfig = z.infer<typeof configSchema>;

export interface SetupConfig {
  apiKey: string;
  baseUrl: string;
}

export interface ConfigSetOperation {
  path: string;
  value: unknown;
}

export function normalizeBaseUrl(value?: string): string {
  const trimmed = (value ?? DEFAULT_BASE_URL).trim();
  if (!trimmed) {
    return DEFAULT_BASE_URL;
  }

  return trimmed.replace(/\/+$/, "");
}

export function buildPluginEntryConfig(setupConfig: SetupConfig): {
  enabled: true;
  config: Record<string, unknown>;
} {
  return {
    enabled: true,
    config: {
      apiKey: setupConfig.apiKey,
      baseUrl: normalizeBaseUrl(setupConfig.baseUrl),
    },
  };
}

export function buildBatchSetOperations(
  setupConfig: SetupConfig
): ConfigSetOperation[] {
  return [
    {
      path: `plugins.entries.${PLUGIN_ID}.enabled`,
      value: true,
    },
    {
      path: `plugins.entries.${PLUGIN_ID}.config.apiKey`,
      value: setupConfig.apiKey,
    },
    {
      path: `plugins.entries.${PLUGIN_ID}.config.baseUrl`,
      value: normalizeBaseUrl(setupConfig.baseUrl),
    },
  ];
}

export function buildInstallSpec(version?: string): string {
  const normalizedVersion = version?.trim();
  return normalizedVersion
    ? `${PACKAGE_NAME}@${normalizedVersion}`
    : PACKAGE_NAME;
}
