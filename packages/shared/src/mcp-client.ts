import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_RETRY_MAX_ATTEMPTS = 3;
const MCP_RETRY_DELAYS_MS = [250, 500, 1000] as const;
const RETRYABLE_TOOL_RESULT_ERROR_PATTERNS = [
  /\bnot connected\b/i,
  /\bconnection closed\b/i,
] as const;
const RETRYABLE_TRANSPORT_ERROR_PATTERNS = [
  /\bconnection closed\b/i,
  /\bsocket hang up\b/i,
  /\bfetch failed\b/i,
  /\beconnreset\b/i,
  /\babort(?:ed|error)?\b/i,
  /\bnetwork(?:\s+)?error\b/i,
  /\bfailed to reconnect\b/i,
  /\bmaximum reconnection attempts\b/i,
  /\bsse stream disconnected\b/i,
] as const;

type ManagedClientMode = "shared" | "isolated";
type CallToolResult = Awaited<ReturnType<Client["callTool"]>>;

interface GetMcpClientOptions {
  forceReconnect?: boolean;
}

interface ManagedMcpClient {
  mode: ManagedClientMode;
  client: Client;
  apiKey: string;
  baseUrl: string;
  leaseCount: number;
  invalidated: boolean;
  closed: boolean;
  pendingClose: boolean;
  closingPromise: Promise<void> | null;
}

interface McpClientLease {
  mode: ManagedClientMode;
  handle: ManagedMcpClient;
}

let sharedClientHandle: ManagedMcpClient | null = null;
let lifecycleLock: Promise<void> = Promise.resolve();

export async function getMcpClient(
  apiKey: string,
  baseUrl: string,
  options: GetMcpClientOptions = {}
): Promise<Client> {
  const handle = await withLifecycleLock(async () => {
    const resolved = await ensureSharedClientHandleUnlocked(
      apiKey,
      baseUrl,
      options.forceReconnect ?? false
    );
    return resolved.handle;
  });
  return handle.client;
}

export async function resetMcpClient(): Promise<void> {
  const handleToClose = await withLifecycleLock(async () => {
    const current = sharedClientHandle;
    sharedClientHandle = null;

    if (!current) {
      return null;
    }

    current.invalidated = true;
    current.pendingClose = true;
    return current.leaseCount === 0 ? current : null;
  });

  if (handleToClose) {
    await closeManagedClient(handleToClose);
  }
}

export async function listMcpTools(
  apiKey: string,
  baseUrl: string
): Promise<Awaited<ReturnType<Client["listTools"]>>> {
  return runWithMcpRetry(apiKey, baseUrl, (client) => client.listTools());
}

export async function callMcpTool(
  apiKey: string,
  baseUrl: string,
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  return runWithMcpRetry(
    apiKey,
    baseUrl,
    (client) =>
      client.callTool({
        name,
        arguments: args,
      }),
    {
      shouldRetryResult: shouldRetryToolResult,
    }
  );
}

async function runWithMcpRetry<T>(
  apiKey: string,
  baseUrl: string,
  operation: (client: Client) => Promise<T>,
  options: {
    shouldRetryResult?: (result: T) => boolean;
  } = {}
): Promise<T> {
  let lastRetryableError: unknown;

  for (let attempt = 1; attempt <= MCP_RETRY_MAX_ATTEMPTS; attempt += 1) {
    const lease =
      attempt === 1
        ? await acquireSharedClientLease(apiKey, baseUrl, false)
        : await acquireIsolatedClientLease(apiKey, baseUrl);

    try {
      const result = await operation(lease.handle.client);
      if (!options.shouldRetryResult?.(result)) {
        return result;
      }

      if (lease.mode === "shared") {
        await invalidateSharedClientHandle(lease.handle);
      }

      if (attempt >= MCP_RETRY_MAX_ATTEMPTS) {
        return result;
      }
    } catch (error) {
      if (!isRetryableTransportError(error)) {
        throw error;
      }

      lastRetryableError = error;
      if (lease.mode === "shared") {
        await invalidateSharedClientHandle(lease.handle);
      }

      if (attempt >= MCP_RETRY_MAX_ATTEMPTS) {
        throw createRetriedTransportError(error, attempt);
      }
    } finally {
      await releaseClientLease(lease);
    }

    await wait(getRetryDelayMs(attempt));
  }

  throw createRetriedTransportError(lastRetryableError, MCP_RETRY_MAX_ATTEMPTS);
}

async function acquireSharedClientLease(
  apiKey: string,
  baseUrl: string,
  forceReconnect: boolean
): Promise<McpClientLease> {
  let previousHandleToClose: ManagedMcpClient | null = null;

  const lease = await withLifecycleLock(async () => {
    const resolved = await ensureSharedClientHandleUnlocked(
      apiKey,
      baseUrl,
      forceReconnect
    );
    previousHandleToClose = resolved.previousHandleToClose;
    resolved.handle.leaseCount += 1;
    return {
      mode: "shared" as const,
      handle: resolved.handle,
    };
  });

  if (previousHandleToClose) {
    await closeManagedClient(previousHandleToClose);
  }

  return lease;
}

async function acquireIsolatedClientLease(
  apiKey: string,
  baseUrl: string
): Promise<McpClientLease> {
  const handle = await createManagedClient(apiKey, baseUrl, "isolated");
  handle.leaseCount = 1;
  return {
    mode: "isolated",
    handle,
  };
}

async function releaseClientLease(lease: McpClientLease): Promise<void> {
  let handleToClose: ManagedMcpClient | null = null;

  await withLifecycleLock(async () => {
    const handle = lease.handle;
    if (handle.leaseCount > 0) {
      handle.leaseCount -= 1;
    }

    if (shouldCloseManagedClient(handle)) {
      handleToClose = handle;
    }
  });

  if (handleToClose) {
    await closeManagedClient(handleToClose);
  }
}

async function invalidateSharedClientHandle(
  handle: ManagedMcpClient
): Promise<void> {
  let handleToClose: ManagedMcpClient | null = null;

  await withLifecycleLock(async () => {
    handle.invalidated = true;
    handle.pendingClose = true;

    if (sharedClientHandle === handle) {
      sharedClientHandle = null;
    }

    if (handle.leaseCount === 0) {
      handleToClose = handle;
    }
  });

  if (handleToClose) {
    await closeManagedClient(handleToClose);
  }
}

async function ensureSharedClientHandleUnlocked(
  apiKey: string,
  baseUrl: string,
  forceReconnect: boolean
): Promise<{
  handle: ManagedMcpClient;
  previousHandleToClose: ManagedMcpClient | null;
}> {
  if (
    !forceReconnect &&
    canReuseSharedClient(sharedClientHandle, apiKey, baseUrl)
  ) {
    return {
      handle: sharedClientHandle!,
      previousHandleToClose: null,
    };
  }

  let previousHandleToClose: ManagedMcpClient | null = null;

  if (sharedClientHandle) {
    sharedClientHandle.invalidated = true;
    sharedClientHandle.pendingClose = true;

    if (sharedClientHandle.leaseCount === 0) {
      previousHandleToClose = sharedClientHandle;
    }

    sharedClientHandle = null;
  }

  const handle = await createManagedClient(apiKey, baseUrl, "shared");
  sharedClientHandle = handle;

  return {
    handle,
    previousHandleToClose,
  };
}

function canReuseSharedClient(
  handle: ManagedMcpClient | null,
  apiKey: string,
  baseUrl: string
): boolean {
  return Boolean(
    handle &&
      !handle.invalidated &&
      !handle.closed &&
      handle.apiKey === apiKey &&
      handle.baseUrl === baseUrl &&
      hasActiveTransport(handle.client)
  );
}

async function createManagedClient(
  apiKey: string,
  baseUrl: string,
  mode: ManagedClientMode
): Promise<ManagedMcpClient> {
  const transport = new StreamableHTTPClientTransport(
    new URL(`${baseUrl}/unified/mcp`),
    {
      requestInit: {
        headers: { "x-api-key": apiKey },
      },
    }
  );

  const client = new Client({
    name: "aitoearn-openclaw-plugin",
    version: "1.0.0",
  });

  const handle: ManagedMcpClient = {
    mode,
    client,
    apiKey,
    baseUrl,
    leaseCount: 0,
    invalidated: false,
    closed: false,
    pendingClose: false,
    closingPromise: null,
  };

  client.onclose = () => {
    handle.closed = true;
    handle.invalidated = true;
    handle.pendingClose = true;

    if (sharedClientHandle === handle) {
      sharedClientHandle = null;
    }
  };

  await client.connect(transport);
  return handle;
}

async function closeManagedClient(handle: ManagedMcpClient): Promise<void> {
  if (handle.closed) {
    return;
  }

  if (handle.closingPromise) {
    await handle.closingPromise;
    return;
  }

  handle.pendingClose = true;
  handle.closingPromise = handle.client
    .close()
    .catch(() => {
      // 忽略关闭错误
    })
    .finally(() => {
      handle.closed = true;
      handle.invalidated = true;
      handle.pendingClose = true;
      handle.closingPromise = null;

      if (sharedClientHandle === handle) {
        sharedClientHandle = null;
      }
    });

  await handle.closingPromise;
}

function shouldCloseManagedClient(handle: ManagedMcpClient): boolean {
  if (handle.leaseCount > 0) {
    return false;
  }

  return (
    handle.mode === "isolated" ||
    handle.pendingClose ||
    handle.invalidated ||
    handle.closed
  );
}

function hasActiveTransport(client: Client): boolean {
  return client.transport !== undefined;
}

function shouldRetryToolResult(result: CallToolResult): boolean {
  if (!isRecord(result)) {
    return false;
  }

  const structuredContent = isRecord(result.structuredContent)
    ? result.structuredContent
    : null;
  const hasErrorFlag =
    result.isError === true ||
    result.status === "error" ||
    structuredContent?.status === "error";

  if (!hasErrorFlag) {
    return false;
  }

  const errorText = collectToolResultErrorText(result);
  return RETRYABLE_TOOL_RESULT_ERROR_PATTERNS.some((pattern) =>
    pattern.test(errorText)
  );
}

function isRetryableTransportError(error: unknown): boolean {
  const text = collectErrorText(error);
  return RETRYABLE_TRANSPORT_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

function collectToolResultErrorText(result: Record<string, unknown>): string {
  const parts: string[] = [];

  for (const key of ["error", "message", "detail", "status"]) {
    const value = result[key];
    if (typeof value === "string" && value.trim()) {
      parts.push(value);
    }
  }

  const structuredContent = result.structuredContent;
  if (structuredContent !== undefined) {
    parts.push(stringifyValue(structuredContent));
  }

  const content = result.content;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (isRecord(item) && typeof item.text === "string") {
        parts.push(item.text);
      } else {
        parts.push(stringifyValue(item));
      }
    }
  }

  return parts.join("\n");
}

function collectErrorText(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  if (isRecord(error)) {
    return [
      typeof error.name === "string" ? error.name : "",
      typeof error.message === "string" ? error.message : "",
      typeof error.error === "string" ? error.error : "",
      typeof error.detail === "string" ? error.detail : "",
      stringifyValue(error),
    ]
      .filter(Boolean)
      .join("\n");
  }

  return stringifyValue(error);
}

function createRetriedTransportError(
  error: unknown,
  attempts: number
): Error {
  const message = collectErrorText(error) || "Unknown MCP transport error";
  const wrapped = new Error(
    `AiToEarn MCP transport failed after ${attempts} attempts: ${message}`
  );

  if (error instanceof Error) {
    Object.defineProperty(wrapped, "cause", {
      value: error,
      configurable: true,
      enumerable: false,
      writable: true,
    });
  }

  return wrapped;
}

function getRetryDelayMs(attempt: number): number {
  return MCP_RETRY_DELAYS_MS[Math.min(attempt - 1, MCP_RETRY_DELAYS_MS.length - 1)];
}

async function withLifecycleLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = lifecycleLock.then(fn, fn);
  lifecycleLock = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function stringifyValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
