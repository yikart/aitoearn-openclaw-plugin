#!/usr/bin/env node

import * as p from "@clack/prompts";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
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

const HELP_TEXT = `Usage: npx -y @aitoearn/aitoearn-openclaw-cli [upgrade]

Bootstrap installer for the AiToEarn OpenClaw plugin.

Examples:
  npx -y @aitoearn/aitoearn-openclaw-cli
  npx -y @aitoearn/aitoearn-openclaw-cli upgrade`;

export async function runSetupCli(
  args: string[],
  deps: CliDependencies = createDefaultDependencies()
): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP_TEXT);
    return 0;
  }

  if (
    args.length > 1 ||
    (args.length === 1 &&
      args[0] !== "setup" &&
      args[0] !== "install" &&
      args[0] !== "upgrade")
  ) {
    console.error(HELP_TEXT);
    return 1;
  }

  const command = (args[0] ?? "auto") as "auto" | "install" | "upgrade";

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
    deps.prompts.outro(
      installResult.action === "update"
        ? 'Upgrade complete! Run "openclaw gateway restart" to apply.'
        : 'Install complete! Run "openclaw gateway restart" to apply.'
    );
    return 0;
  }

  if (command === "auto" && hasConfiguredPluginEntry(preInstallConfig)) {
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

  const configSpinner = deps.prompts.spinner();
  configSpinner.start("Writing OpenClaw configuration...");

  try {
    const currentConfig = await deps.readConfig();
    const nextConfig = applySetupConfigToOpenClawConfig(
      currentConfig,
      setupResult.config
    );
    await deps.writeConfig(nextConfig);
  } catch (error) {
    configSpinner.stop("Failed to write OpenClaw configuration.");
    deps.prompts.cancel(formatError(error));
    return 1;
  }

  configSpinner.stop("OpenClaw configuration updated.");
  deps.prompts.outro(
    'Configuration saved! Run "openclaw gateway restart" to apply.'
  );
  return 0;
}

function createDefaultDependencies(): CliDependencies {
  return {
    prompts: p,
    loadPackageContext: async () =>
      loadPackageContext(fileURLToPath(import.meta.url)),
    installPlugin: async (params) => installPluginWithOpenClaw(params),
    readConfig: async () => readOpenClawConfig(),
    writeConfig: async (config) => writeOpenClawConfig(config),
    runSetupFlow: runInteractiveSetupFlow,
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const exitCode = await runSetupCli(process.argv.slice(2));
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}

export function shouldRunCliMain(
  entryPath: string | undefined,
  moduleUrl: string = import.meta.url
): boolean {
  if (!entryPath) {
    return false;
  }

  const resolvedEntryPath = path.resolve(entryPath);
  const currentFilePath = fileURLToPath(moduleUrl);

  try {
    return realpathSync(resolvedEntryPath) === realpathSync(currentFilePath);
  } catch {
    return currentFilePath === resolvedEntryPath;
  }
}

if (shouldRunCliMain(process.argv[1])) {
  void main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    p.cancel(message);
    process.exitCode = 1;
  });
}
