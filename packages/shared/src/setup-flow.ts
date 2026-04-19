import * as p from "@clack/prompts";
import { listMcpTools } from "./mcp-client.js";
import {
  CHINA_BASE_URL,
  DEFAULT_BASE_URL,
  normalizeBaseUrl,
  type SetupConfig,
} from "./plugin-config.js";

type EnvironmentOption = "prod" | "prod-cn" | "custom";

export interface SetupFlowOptions {
  title?: string;
  showIntro?: boolean;
  compatibilityNote?: string;
  validationMessage?: string;
}

export type SetupFlowResult =
  | {
      status: "completed";
      config: SetupConfig;
      toolCount: number;
    }
  | {
      status: "cancelled";
    }
  | {
      status: "validation_failed";
      error: string;
    };

export async function runInteractiveSetupFlow(
  options: SetupFlowOptions = {}
): Promise<SetupFlowResult> {
  if (options.showIntro !== false) {
    p.intro(options.title ?? "AiToEarn Plugin Setup");
  }

  if (options.compatibilityNote) {
    p.note(options.compatibilityNote, "Compatibility");
  }

  const apiKey = await p.text({
    message: "Enter your API Key:",
    validate: (value) => {
      if (!value) {
        return "API Key is required";
      }
    },
  });

  if (p.isCancel(apiKey)) {
    p.cancel("Setup cancelled");
    return { status: "cancelled" };
  }

  const environment = await p.select<EnvironmentOption>({
    message: "Select environment:",
    options: [
      {
        value: "prod",
        label: "Global (aitoearn.ai)",
        hint: "Global region",
      },
      {
        value: "prod-cn",
        label: "China (aitoearn.cn)",
        hint: "China region",
      },
      { value: "custom", label: "Custom URL", hint: "Self-hosted" },
    ],
  });

  if (p.isCancel(environment)) {
    p.cancel("Setup cancelled");
    return { status: "cancelled" };
  }

  const baseUrl = await resolveBaseUrl(environment);
  if (!baseUrl) {
    return { status: "cancelled" };
  }

  const spinner = p.spinner();
  spinner.start(options.validationMessage ?? "Validating API Key...");

  const validationResult = await validateWithMcpClient(apiKey, baseUrl);
  if (!validationResult.success) {
    spinner.stop("Validation failed.");
    p.cancel(`Validation failed: ${validationResult.error}`);
    return {
      status: "validation_failed",
      error: validationResult.error,
    };
  }

  spinner.stop(`Connected! Found ${validationResult.toolCount} tools.`);

  return {
    status: "completed",
    config: {
      apiKey,
      baseUrl: normalizeBaseUrl(baseUrl),
    },
    toolCount: validationResult.toolCount,
  };
}

async function resolveBaseUrl(
  environment: EnvironmentOption
): Promise<string | null> {
  if (environment === "prod-cn") {
    return CHINA_BASE_URL;
  }

  if (environment === "prod") {
    return DEFAULT_BASE_URL;
  }

  const customUrl = await p.text({
    message: "Enter custom base URL:",
    placeholder: "https://your-domain.com/api",
    validate: (value) => {
      if (!value) {
        return "Base URL is required";
      }
    },
  });

  if (p.isCancel(customUrl)) {
    p.cancel("Setup cancelled");
    return null;
  }

  return normalizeBaseUrl(customUrl);
}

export async function validateWithMcpClient(
  apiKey: string,
  baseUrl: string
): Promise<
  { success: true; toolCount: number } | { success: false; error: string }
> {
  try {
    const { tools } = await listMcpTools(apiKey, normalizeBaseUrl(baseUrl));
    return { success: true, toolCount: tools.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}
