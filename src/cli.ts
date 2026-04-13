#!/usr/bin/env node

import * as p from "@clack/prompts";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildBatchSetOperations,
  buildInstallSpec,
  PLUGIN_ID,
} from "./plugin-config.js";
import {
  runInteractiveSetupFlow,
  type SetupFlowResult,
} from "./setup-flow.js";

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

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
  loadPackageVersion: () => Promise<string | undefined>;
  runCommand: (command: string, args: string[]) => Promise<CommandResult>;
  runSetupFlow: (options?: { showIntro?: boolean }) => Promise<SetupFlowResult>;
}

const HELP_TEXT = `Usage: npx @aitoearn/openclaw-plugin [setup]

Interactive installer for the AiToEarn OpenClaw plugin.

Examples:
  npx @aitoearn/openclaw-plugin
  npx @aitoearn/openclaw-plugin setup`;

export async function runSetupCli(
  args: string[],
  deps: CliDependencies = createDefaultDependencies()
): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP_TEXT);
    return 0;
  }

  if (args.length > 1 || (args.length === 1 && args[0] !== "setup")) {
    console.error(HELP_TEXT);
    return 1;
  }

  deps.prompts.intro("AiToEarn OpenClaw Setup");

  const openclawCheckSpinner = deps.prompts.spinner();
  openclawCheckSpinner.start("Checking OpenClaw CLI...");
  const openclawVersionResult = await deps.runCommand("openclaw", ["--version"]);
  if (openclawVersionResult.code !== 0) {
    openclawCheckSpinner.stop("OpenClaw CLI not found.");
    deps.prompts.cancel(
      formatCommandFailure(
        "Install OpenClaw first, then rerun this command.",
        openclawVersionResult
      )
    );
    return 1;
  }
  openclawCheckSpinner.stop("OpenClaw CLI detected.");

  const pluginCheckSpinner = deps.prompts.spinner();
  pluginCheckSpinner.start("Checking plugin installation...");
  const inspectResult = await deps.runCommand("openclaw", [
    "plugins",
    "inspect",
    PLUGIN_ID,
    "--json",
  ]);

  if (inspectResult.code === 0) {
    pluginCheckSpinner.stop("AiToEarn plugin is already installed.");
  } else {
    pluginCheckSpinner.stop("AiToEarn plugin is not installed yet.");

    const installSpinner = deps.prompts.spinner();
    installSpinner.start("Installing AiToEarn plugin with OpenClaw...");

    const packageVersion = await deps.loadPackageVersion();
    const installResult = await deps.runCommand("openclaw", [
      "plugins",
      "install",
      buildInstallSpec(packageVersion),
    ]);

    if (installResult.code !== 0) {
      installSpinner.stop("Plugin installation failed.");
      deps.prompts.cancel(
        formatCommandFailure("OpenClaw plugin install failed.", installResult)
      );
      return 1;
    }

    installSpinner.stop("AiToEarn plugin installed.");
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

  const batchJson = JSON.stringify(buildBatchSetOperations(setupResult.config));
  const writeConfigResult = await deps.runCommand("openclaw", [
    "config",
    "set",
    "--batch-json",
    batchJson,
  ]);

  if (writeConfigResult.code !== 0) {
    configSpinner.stop("Failed to write OpenClaw configuration.");
    deps.prompts.cancel(
      formatCommandFailure(
        "OpenClaw configuration update failed.",
        writeConfigResult
      )
    );
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
    loadPackageVersion,
    runCommand,
    runSetupFlow: runInteractiveSetupFlow,
  };
}

async function loadPackageVersion(): Promise<string | undefined> {
  try {
    const packageJsonPath = new URL("../../package.json", import.meta.url);
    const raw = await readFile(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };

    return typeof parsed.version === "string" ? parsed.version : undefined;
  } catch {
    return undefined;
  }
}

async function runCommand(
  command: string,
  args: string[]
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve({
        code: 1,
        stdout,
        stderr: error.message,
      });
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve({
        code: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

function formatCommandFailure(
  prefix: string,
  result: CommandResult
): string {
  const detail = result.stderr.trim() || result.stdout.trim();
  if (!detail) {
    return prefix;
  }

  const excerpt = detail.split("\n").slice(-8).join("\n");
  return `${prefix}\n${excerpt}`;
}

async function main(): Promise<void> {
  const exitCode = await runSetupCli(process.argv.slice(2));
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}

const currentFilePath = fileURLToPath(import.meta.url);
if (process.argv[1] && currentFilePath === path.resolve(process.argv[1])) {
  void main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    p.cancel(message);
    process.exitCode = 1;
  });
}
