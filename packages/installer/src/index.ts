#!/usr/bin/env node

import * as p from "@clack/prompts";
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { runSetupCli } from "./cli.js";

const packageJson = JSON.parse(
  readFileSync(new URL("../../../package.json", import.meta.url), "utf8")
) as { version?: string };

const program = new Command();

program
  .name("openclaw-plugin-cli")
  .description("Bootstrap installer for the AiToEarn OpenClaw plugin.")
  .version(packageJson.version ?? "0.0.0", "-V, --cli-version")
  .action(async () => {
    await runCommand("auto");
  });

program
  .command("install")
  .description("Install and configure the AiToEarn OpenClaw plugin.")
  .action(async () => {
    await runCommand("install");
  });

program
  .command("upgrade")
  .description("Upgrade an npm-installed AiToEarn OpenClaw plugin.")
  .action(async () => {
    await runCommand("upgrade");
  });

program
  .command("setup", { hidden: true })
  .description("Legacy alias for install.")
  .action(async () => {
    await runCommand("install");
  });

void program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  p.cancel(message);
  process.exitCode = 1;
});

async function runCommand(command: "auto" | "install" | "upgrade"): Promise<void> {
  const exitCode = await runSetupCli(command);
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}
