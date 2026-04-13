import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PluginLogger } from "openclaw/plugin-sdk/plugin-entry";
import type { PluginConfig } from "./plugin-config.js";
import { PLUGIN_ID } from "./plugin-config.js";
import {
  createToolSnapshot,
  parseToolDiscoveryHelperResult,
  parseToolSnapshot,
  type ToolDefinition,
} from "./tools.js";

export interface SyncToolDiscoveryLog {
  level: "info" | "warn";
  message: string;
}

export interface SyncToolDiscoveryResult {
  source: "remote" | "snapshot" | "none";
  tools: ToolDefinition[];
  logs: SyncToolDiscoveryLog[];
}

interface ToolDiscoveryHelperPayload {
  config: Record<string, unknown>;
  pluginConfig: PluginConfig;
}

interface ToolDiscoveryFs {
  mkdirSync: typeof mkdirSync;
  readFileSync: typeof readFileSync;
  renameSync: typeof renameSync;
  writeFileSync: typeof writeFileSync;
}

interface SyncToolDiscoveryDeps {
  execFileSync: typeof execFileSync;
  fs: ToolDiscoveryFs;
  helperPath: string;
  now: () => number;
  pid: number;
}

export interface LoadToolDefinitionsSyncParams {
  config: Record<string, unknown>;
  pluginConfig: PluginConfig;
  stateDir: string;
  env?: NodeJS.ProcessEnv;
  deps?: Partial<SyncToolDiscoveryDeps>;
}

const DEFAULT_HELPER_PATH = fileURLToPath(
  new URL("./tool-discovery-helper.js", import.meta.url)
);

export function loadToolDefinitionsSync(
  params: LoadToolDefinitionsSyncParams
): SyncToolDiscoveryResult {
  const logs: SyncToolDiscoveryLog[] = [];

  if (!params.pluginConfig.apiKey) {
    return { source: "none", tools: [], logs };
  }

  const deps = resolveDeps(params.deps);
  const snapshotPath = resolveToolSnapshotPath(params.stateDir);
  const remoteResult = runToolDiscoveryHelperSync(
    {
      config: params.config,
      pluginConfig: params.pluginConfig,
    },
    params.env ?? process.env,
    deps
  );

  if (remoteResult.status === "ok") {
    if (remoteResult.invalidCount > 0 || remoteResult.duplicateCount > 0) {
      logs.push({
        level: "warn",
        message: buildSkippedToolWarning(
          "AiToEarn tool sync skipped invalid remote definitions",
          remoteResult.invalidCount,
          remoteResult.duplicateCount
        ),
      });
    }

    logs.push({
      level: "info",
      message: `AiToEarn tool sync loaded ${remoteResult.tools.length} remote tools.`,
    });

    try {
      writeToolSnapshotSync(snapshotPath, remoteResult.tools, deps);
    } catch (error) {
      logs.push({
        level: "warn",
        message: `AiToEarn tool sync could not update local snapshot: ${formatError(error)}`,
      });
    }

    return {
      source: "remote",
      tools: remoteResult.tools,
      logs,
    };
  }

  if (remoteResult.status === "config_error") {
    logs.push({
      level: "warn",
      message: `AiToEarn tool sync disabled: ${remoteResult.message}`,
    });
    return { source: "none", tools: [], logs };
  }

  if (remoteResult.status !== "sync_error") {
    return { source: "none", tools: [], logs };
  }

  const snapshotResult = readToolSnapshotSync(snapshotPath, deps);
  if (snapshotResult.snapshot) {
    logs.push({
      level: "warn",
      message: `AiToEarn tool sync failed, using cached snapshot: ${remoteResult.message}`,
    });

    if (snapshotResult.invalidCount > 0 || snapshotResult.duplicateCount > 0) {
      logs.push({
        level: "warn",
        message: buildSkippedToolWarning(
          "AiToEarn cached snapshot skipped invalid definitions",
          snapshotResult.invalidCount,
          snapshotResult.duplicateCount
        ),
      });
    }

    return {
      source: "snapshot",
      tools: snapshotResult.snapshot.tools,
      logs,
    };
  }

  logs.push({
    level: "warn",
    message: `AiToEarn tool sync failed and no cached snapshot is available: ${remoteResult.message}`,
  });

  return { source: "none", tools: [], logs };
}

export function applySyncToolDiscoveryLogs(
  logger: Pick<PluginLogger, "info" | "warn">,
  logs: SyncToolDiscoveryLog[]
): void {
  for (const log of logs) {
    logger[log.level](log.message);
  }
}

export function resolveToolSnapshotPath(stateDir: string): string {
  return path.join(stateDir, "cache", `${PLUGIN_ID}-tools.json`);
}

function resolveDeps(
  overrides?: Partial<SyncToolDiscoveryDeps>
): SyncToolDiscoveryDeps {
  const fs = overrides?.fs
    ? {
        mkdirSync: overrides.fs.mkdirSync,
        readFileSync: overrides.fs.readFileSync,
        renameSync: overrides.fs.renameSync,
        writeFileSync: overrides.fs.writeFileSync,
      }
    : {
        mkdirSync,
        readFileSync,
        renameSync,
        writeFileSync,
      };

  return {
    execFileSync,
    helperPath: DEFAULT_HELPER_PATH,
    now: () => Date.now(),
    pid: process.pid,
    ...overrides,
    fs,
  };
}

function runToolDiscoveryHelperSync(
  payload: ToolDiscoveryHelperPayload,
  env: NodeJS.ProcessEnv,
  deps: SyncToolDiscoveryDeps
) {
  try {
    const stdout = deps.execFileSync(process.execPath, [deps.helperPath], {
      encoding: "utf8",
      env,
      input: JSON.stringify(payload),
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    });

    const parsed = parseToolDiscoveryHelperResult(JSON.parse(stdout));
    if (!parsed) {
      return {
        status: "sync_error" as const,
        message: "Tool discovery helper returned an invalid payload.",
      };
    }

    return parsed;
  } catch (error) {
    return {
      status: "sync_error" as const,
      message: formatExecFileError(error),
    };
  }
}

function readToolSnapshotSync(pathname: string, deps: SyncToolDiscoveryDeps) {
  try {
    const raw = deps.fs.readFileSync(pathname, "utf8");
    return parseToolSnapshot(JSON.parse(raw));
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        snapshot: null,
        tools: [],
        invalidCount: 0,
        duplicateCount: 0,
      };
    }

    return {
      snapshot: null,
      tools: [],
      invalidCount: 0,
      duplicateCount: 0,
    };
  }
}

function writeToolSnapshotSync(
  pathname: string,
  tools: ToolDefinition[],
  deps: SyncToolDiscoveryDeps
): void {
  const dir = path.dirname(pathname);
  deps.fs.mkdirSync(dir, { recursive: true });

  const tempPath = `${pathname}.${deps.pid}.${deps.now()}.tmp`;
  const snapshot = createToolSnapshot(tools);
  deps.fs.writeFileSync(tempPath, JSON.stringify(snapshot, null, 2), "utf8");
  deps.fs.renameSync(tempPath, pathname);
}

function buildSkippedToolWarning(
  prefix: string,
  invalidCount: number,
  duplicateCount: number
): string {
  const parts: string[] = [];
  if (invalidCount > 0) {
    parts.push(`${invalidCount} invalid`);
  }
  if (duplicateCount > 0) {
    parts.push(`${duplicateCount} duplicate`);
  }

  return `${prefix} (${parts.join(", ")}).`;
}

function formatExecFileError(error: unknown): string {
  if (error instanceof Error) {
    const syncError = error as Error & {
      stderr?: Buffer | string;
      stdout?: Buffer | string;
      signal?: NodeJS.Signals;
    };
    const stderr = syncError.stderr?.toString().trim();
    const stdout = syncError.stdout?.toString().trim();
    const detail = stderr || stdout;

    if (syncError.signal) {
      return `helper terminated by signal ${syncError.signal}`;
    }

    return detail ? `${syncError.message}: ${detail}` : syncError.message;
  }

  return String(error);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
