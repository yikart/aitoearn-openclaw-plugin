import * as p from "@clack/prompts";
import {
  applyDefaultToolAllowlistToOpenClawConfig,
  applySetupConfigToOpenClawConfig,
  hasConfiguredPluginEntry,
  readOpenClawConfig,
  writeOpenClawConfig,
} from "../../shared/src/openclaw-config.js";
import {
  runInteractiveSetupFlow,
  type SetupFlowResult,
} from "../../shared/src/setup-flow.js";
import {
  installPluginWithOpenClaw,
  loadPackageContext,
  type InstallPluginResult,
  type PackageContext,
} from "./openclaw-install.js";

interface SpinnerApi {
  start(message: string): void;
  stop(message?: string): void;
}

interface PromptApi {
  intro(message: string): void;
  cancel(message: string): void;
  outro(message: string): void;
  spinner(): SpinnerApi;
}

interface CliDependencies {
  prompts: PromptApi;
  loadPackageContext: () => Promise<PackageContext>;
  installPlugin: (params: {
    command: "auto" | "install" | "upgrade";
    currentConfig: Record<string, unknown>;
    packageContext: PackageContext;
  }) => Promise<InstallPluginResult>;
  readConfig: () => Promise<Record<string, unknown>>;
  writeConfig: (config: Record<string, unknown>) => Promise<string>;
  runSetupFlow: (options?: { showIntro?: boolean }) => Promise<SetupFlowResult>;
}

export async function runSetupCli(
  command: "auto" | "install" | "upgrade",
  deps: CliDependencies = createDefaultDependencies()
): Promise<number> {
  deps.prompts.intro("AiToEarn OpenClaw Setup");

  let packageContext: PackageContext;
  try {
    packageContext = await deps.loadPackageContext();
  } catch (error) {
    deps.prompts.cancel(formatError(error));
    return 1;
  }

  let preInstallConfig: Record<string, unknown>;
  try {
    preInstallConfig = await deps.readConfig();
  } catch (error) {
    deps.prompts.cancel(formatError(error));
    return 1;
  }

  const installSpinner = deps.prompts.spinner();
  installSpinner.start("Installing AiToEarn plugin via OpenClaw...");

  let installResult: InstallPluginResult;
  try {
    installResult = await deps.installPlugin({
      command,
      currentConfig: preInstallConfig,
      packageContext,
    });
  } catch (error) {
    installSpinner.stop("Plugin installation failed.");
    deps.prompts.cancel(formatError(error));
    return 1;
  }

  installSpinner.stop(
    installResult.action === "update"
      ? "AiToEarn plugin updated."
      : "AiToEarn plugin installed."
  );

  if (command === "upgrade") {
    const updateResult = await updateOpenClawConfig(
      deps,
      applyDefaultToolAllowlistToOpenClawConfig
    );
    if (updateResult !== 0) {
      return updateResult;
    }

    deps.prompts.outro(
      installResult.action === "update"
        ? 'Upgrade complete! Run "openclaw gateway restart" to apply.'
        : 'Install complete! Run "openclaw gateway restart" to apply.'
    );
    return 0;
  }

  if (command === "auto" && hasConfiguredPluginEntry(preInstallConfig)) {
    const updateResult = await updateOpenClawConfig(
      deps,
      applyDefaultToolAllowlistToOpenClawConfig
    );
    if (updateResult !== 0) {
      return updateResult;
    }

    deps.prompts.outro(
      'Existing configuration detected. Upgrade complete! Run "openclaw gateway restart" to apply.'
    );
    return 0;
  }

  const setupResult = await deps.runSetupFlow({ showIntro: false });
  if (setupResult.status === "cancelled") {
    return 0;
  }

  if (setupResult.status === "validation_failed") {
    return 1;
  }

  const updateResult = await updateOpenClawConfig(deps, (currentConfig) =>
    applySetupConfigToOpenClawConfig(currentConfig, setupResult.config)
  );
  if (updateResult !== 0) {
    return updateResult;
  }

  deps.prompts.outro(
    'Configuration saved! Run "openclaw gateway restart" to apply.'
  );
  return 0;
}

function createDefaultDependencies(): CliDependencies {
  return {
    prompts: p,
    loadPackageContext: async () => loadPackageContext(import.meta.url),
    installPlugin: async (params) => installPluginWithOpenClaw(params),
    readConfig: async () => readOpenClawConfig(),
    writeConfig: async (config) => writeOpenClawConfig(config),
    runSetupFlow: runInteractiveSetupFlow,
  };
}

async function updateOpenClawConfig(
  deps: CliDependencies,
  transform: (config: Record<string, unknown>) => Record<string, unknown>
): Promise<number> {
  const configSpinner = deps.prompts.spinner();
  configSpinner.start("Writing OpenClaw configuration...");

  try {
    const currentConfig = await deps.readConfig();
    const nextConfig = transform(currentConfig);
    if (JSON.stringify(nextConfig) === JSON.stringify(currentConfig)) {
      configSpinner.stop("OpenClaw configuration already up to date.");
      return 0;
    }

    await deps.writeConfig(nextConfig);
  } catch (error) {
    configSpinner.stop("Failed to write OpenClaw configuration.");
    deps.prompts.cancel(formatError(error));
    return 1;
  }

  configSpinner.stop("OpenClaw configuration updated.");
  return 0;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
