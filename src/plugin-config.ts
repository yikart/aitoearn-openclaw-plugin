import { z } from "zod";

export const PLUGIN_ID = "aitoearn";
export const PLUGIN_NAME = "AiToEarn";
export const PACKAGE_NAME = "@aitoearn/openclaw-plugin";
export const DEFAULT_BASE_URL = "https://aitoearn.ai/api";
export const CHINA_BASE_URL = "https://aitoearn.cn/api";

export type AiToEarnEnvironment = "china" | "global" | "self_hosted";

export const CHINA_PUBLISH_PLATFORMS = [
  "douyin",
  "KWAI",
  "bilibili",
  "wxGzh",
] as const;

export const GLOBAL_PUBLISH_PLATFORMS = [
  "tiktok",
  "youtube",
  "twitter",
  "facebook",
  "instagram",
  "threads",
  "pinterest",
  "linkedin",
] as const;

const PUBLISH_TOOL_PLATFORM_BY_NAME: Record<string, string> = {
  publishPostToBilibili: "bilibili",
  publishPostToWxGzh: "wxGzh",
  publishPostToYoutube: "youtube",
  publishPostToPinterest: "pinterest",
  publishPostToThreads: "threads",
  publishPostToTiktok: "tiktok",
  publishPostToFacebook: "facebook",
  publishPostToInstagram: "instagram",
  publishPostToKwai: "KWAI",
  publishPostToTwitter: "twitter",
  publishPostToDouyin: "douyin",
  publishPostToLinkedIn: "linkedin",
  publishPostToLinkedin: "linkedin",
  publishPostToGoogleBusiness: "google_business",
};

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

export function resolveAiToEarnEnvironment(
  baseUrl?: string
): AiToEarnEnvironment {
  const normalized = normalizeBaseUrl(baseUrl);

  try {
    const hostname = new URL(normalized).hostname.toLowerCase();

    if (hostname === "aitoearn.cn" || hostname.endsWith(".aitoearn.cn")) {
      return "china";
    }

    if (hostname === "aitoearn.ai" || hostname.endsWith(".aitoearn.ai")) {
      return "global";
    }

    return "self_hosted";
  } catch {
    const lower = normalized.toLowerCase();

    if (lower.includes("aitoearn.cn")) {
      return "china";
    }

    if (lower.includes("aitoearn.ai")) {
      return "global";
    }

    return "self_hosted";
  }
}

export function getPublishPlatformPolicy(
  environment: AiToEarnEnvironment
): string[] {
  if (environment === "china") {
    return [...CHINA_PUBLISH_PLATFORMS];
  }

  if (environment === "global") {
    return [...GLOBAL_PUBLISH_PLATFORMS];
  }

  return [];
}

export function getPublishToolPlatform(toolName: string): string | null {
  return PUBLISH_TOOL_PLATFORM_BY_NAME[toolName] ?? null;
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
