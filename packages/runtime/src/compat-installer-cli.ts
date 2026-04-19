#!/usr/bin/env node

import * as p from "@clack/prompts";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INSTALLER_PACKAGE_NAME } from "../../shared/src/plugin-config.js";

export interface CompatInstallerCliDeps {
  runSetupCli?: (args: string[]) => Promise<number>;
  warn: (message: string) => void;
}

export async function runCompatInstallerCli(
  args: string[],
  deps: CompatInstallerCliDeps = {
    warn: (message) => console.warn(message),
  }
): Promise<number> {
  deps.warn(
    `Deprecated compatibility entrypoint detected. Forwarding to ${INSTALLER_PACKAGE_NAME}.`
  );

  const runSetupCli = deps.runSetupCli ?? (await loadInstallerRunSetupCli());
  return runSetupCli(args);
}

async function main(): Promise<void> {
  const exitCode = await runCompatInstallerCli(process.argv.slice(2));
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}

async function loadInstallerRunSetupCli(): Promise<
  (args: string[]) => Promise<number>
> {
  const mod = (await import(INSTALLER_PACKAGE_NAME)) as {
    runSetupCli?: unknown;
  };

  if (typeof mod.runSetupCli !== "function") {
    throw new Error(
      `${INSTALLER_PACKAGE_NAME} does not export a compatible runSetupCli function.`
    );
  }

  return mod.runSetupCli as (args: string[]) => Promise<number>;
}

function shouldRunCompatCliMain(
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

if (shouldRunCompatCliMain(process.argv[1])) {
  void main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    p.cancel(
      `Compatibility installer entrypoint failed. Prefer \`npx -y ${INSTALLER_PACKAGE_NAME}\`. ${message}`
    );
    process.exitCode = 1;
  });
}
