#!/usr/bin/env node

import * as p from "@clack/prompts";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runSetupCli } from "./cli.js";

export async function runSetupCliMain(
  args: string[],
  runCli: (args: string[]) => Promise<number> = runSetupCli
): Promise<number> {
  const exitCode = await runCli(args);
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }

  return exitCode;
}

async function main(): Promise<void> {
  await runSetupCliMain(process.argv.slice(2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    p.cancel(message);
    process.exitCode = 1;
  });
}
