import { workerData } from "node:worker_threads";
import { listMcpTools } from "../../shared/src/mcp-client.js";
import { runToolDiscoveryHelper } from "./tool-discovery-helper.js";

interface ToolDiscoveryWorkerData {
  configRuntimeModuleSpecifier: string;
  payload: {
    config: Record<string, unknown>;
    pluginConfig: unknown;
  };
  env: NodeJS.ProcessEnv;
  resultBuffer: SharedArrayBuffer;
  stateBuffer: SharedArrayBuffer;
}

const enum WorkerSyncState {
  Pending = 0,
  Success = 1,
  ResultTooLarge = 2,
}

void main().catch((error) => {
  writeResult({
    status: "sync_error",
    message: formatError(error),
  });
});

async function main(): Promise<void> {
  const data = workerData as ToolDiscoveryWorkerData;
  const configRuntimeModule = await import(data.configRuntimeModuleSpecifier);
  const resolveConfiguredSecretInputString =
    configRuntimeModule.resolveConfiguredSecretInputString;

  if (typeof resolveConfiguredSecretInputString !== "function") {
    throw new Error(
      `Failed to load resolveConfiguredSecretInputString from ${data.configRuntimeModuleSpecifier}.`
    );
  }

  const result = await runToolDiscoveryHelper(data.payload, {
    env: data.env ?? process.env,
    listMcpTools,
    resolveConfiguredSecretInputString,
  });

  writeResult(result);
}

function writeResult(result: unknown): void {
  const data = workerData as ToolDiscoveryWorkerData;
  const state = new Int32Array(data.stateBuffer);
  const buffer = new Uint8Array(data.resultBuffer);
  const encoded = new TextEncoder().encode(JSON.stringify(result));

  if (encoded.length > buffer.length) {
    Atomics.store(state, 1, encoded.length);
    Atomics.store(state, 0, WorkerSyncState.ResultTooLarge);
    Atomics.notify(state, 0, 1);
    return;
  }

  buffer.set(encoded);
  Atomics.store(state, 1, encoded.length);
  Atomics.store(state, 0, WorkerSyncState.Success);
  Atomics.notify(state, 0, 1);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
