import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { Worker, type WorkerOptions } from "node:worker_threads";
import type { PluginLogger } from "openclaw/plugin-sdk/plugin-entry";
import type { PluginConfig } from "../../shared/src/plugin-config.js";
import { PLUGIN_ID } from "../../shared/src/plugin-config.js";
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

interface WorkerLike {
  terminate(): Promise<number>;
}

interface ToolDiscoveryWorkerData {
  payload: ToolDiscoveryHelperPayload;
  env: NodeJS.ProcessEnv;
  resultBuffer: SharedArrayBuffer;
  stateBuffer: SharedArrayBuffer;
}

interface RunWorkerSyncOptions {
  createWorker: (filename: URL, options: WorkerOptions) => WorkerLike;
  env: NodeJS.ProcessEnv;
  payload: ToolDiscoveryHelperPayload;
  resultBufferBytes: number;
  timeoutMs: number;
  workerPath: URL;
}

interface SyncToolDiscoveryDeps {
  createWorker: (filename: URL, options: WorkerOptions) => WorkerLike;
  fs: ToolDiscoveryFs;
  now: () => number;
  pid: number;
  resultBufferBytes: number;
  timeoutMs: number;
  workerPath: URL;
}

export interface LoadToolDefinitionsSyncParams {
  config: Record<string, unknown>;
  pluginConfig: PluginConfig;
  stateDir: string;
  env?: NodeJS.ProcessEnv;
  deps?: Partial<SyncToolDiscoveryDeps>;
}

const DEFAULT_WORKER_PATH = new URL("./tool-discovery-worker.js", import.meta.url);
const DEFAULT_RESULT_BUFFER_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 5000;

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

export function runToolDiscoveryWorkerSync(
  options: RunWorkerSyncOptions
): string {
  const state = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2));
  const resultBuffer = new Uint8Array(
    new SharedArrayBuffer(options.resultBufferBytes)
  );

  let worker: WorkerLike;

  try {
    const workerData: ToolDiscoveryWorkerData = {
      payload: options.payload,
      env: options.env,
      resultBuffer: resultBuffer.buffer as SharedArrayBuffer,
      stateBuffer: state.buffer as SharedArrayBuffer,
    };
    worker = options.createWorker(options.workerPath, { workerData });
  } catch (error) {
    throw new Error(`Failed to start tool discovery worker: ${formatError(error)}`);
  }

  const waitResult = Atomics.wait(state, 0, 0, options.timeoutMs);
  const status = Atomics.load(state, 0);
  const length = Atomics.load(state, 1);

  if (waitResult === "timed-out" && status === WorkerSyncState.Pending) {
    void worker.terminate();
    throw new Error(`Tool discovery worker timed out after ${options.timeoutMs}ms.`);
  }

  if (status === WorkerSyncState.ResultTooLarge) {
    throw new Error(
      `Tool discovery worker payload exceeded ${options.resultBufferBytes} bytes.`
    );
  }

  if (status !== WorkerSyncState.Success) {
    throw new Error("Tool discovery worker did not return a valid response.");
  }

  return decodeWorkerResult(resultBuffer, length);
}

const enum WorkerSyncState {
  Pending = 0,
  Success = 1,
  ResultTooLarge = 2,
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
    createWorker: (filename, options) => new Worker(filename, options),
    now: () => Date.now(),
    pid: process.pid,
    resultBufferBytes: DEFAULT_RESULT_BUFFER_BYTES,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    workerPath: DEFAULT_WORKER_PATH,
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
    const stdout = runToolDiscoveryWorkerSync({
      createWorker: deps.createWorker,
      env,
      payload,
      resultBufferBytes: deps.resultBufferBytes,
      timeoutMs: deps.timeoutMs,
      workerPath: deps.workerPath,
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
      message: formatError(error),
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

function decodeWorkerResult(buffer: Uint8Array, length: number): string {
  if (length <= 0 || length > buffer.length) {
    throw new Error("Tool discovery worker returned an invalid payload length.");
  }

  return new TextDecoder().decode(buffer.subarray(0, length));
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
