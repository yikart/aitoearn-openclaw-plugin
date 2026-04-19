import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

let mcpClient: Client | null = null;
let currentApiKey: string | null = null;
let currentBaseUrl: string | null = null;
const MCP_RETRY_MAX_ATTEMPTS = 2;
const MCP_RETRY_DELAY_MS = 250;

interface GetMcpClientOptions {
  forceReconnect?: boolean;
}

export async function getMcpClient(
  apiKey: string,
  baseUrl: string,
  options: GetMcpClientOptions = {}
): Promise<Client> {
  // 如果配置没变且客户端已连接，复用
  if (
    !options.forceReconnect &&
    mcpClient &&
    currentApiKey === apiKey &&
    currentBaseUrl === baseUrl
  ) {
    return mcpClient;
  }

  // 关闭旧连接
  if (mcpClient) {
    try {
      await mcpClient.close();
    } catch {
      // 忽略关闭错误
    }
  }

  const transport = new StreamableHTTPClientTransport(
    new URL(`${baseUrl}/unified/mcp`),
    {
      requestInit: {
        headers: { "x-api-key": apiKey },
      },
    }
  );

  mcpClient = new Client({
    name: "aitoearn-openclaw-plugin",
    version: "1.0.0",
  });

  await mcpClient.connect(transport);

  currentApiKey = apiKey;
  currentBaseUrl = baseUrl;

  return mcpClient;
}

export async function resetMcpClient(): Promise<void> {
  if (!mcpClient) {
    currentApiKey = null;
    currentBaseUrl = null;
    return;
  }

  try {
    await mcpClient.close();
  } catch {
    // 忽略关闭错误
  } finally {
    mcpClient = null;
    currentApiKey = null;
    currentBaseUrl = null;
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
): Promise<Awaited<ReturnType<Client["callTool"]>>> {
  return runWithMcpRetry(apiKey, baseUrl, (client) =>
    client.callTool({
      name,
      arguments: args,
    })
  );
}

async function runWithMcpRetry<T>(
  apiKey: string,
  baseUrl: string,
  operation: (client: Client) => Promise<T>
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MCP_RETRY_MAX_ATTEMPTS; attempt += 1) {
    try {
      const client = await getMcpClient(apiKey, baseUrl, {
        forceReconnect: attempt > 1,
      });
      return await operation(client);
    } catch (error) {
      lastError = error;
      if (attempt >= MCP_RETRY_MAX_ATTEMPTS) {
        throw error;
      }

      await resetMcpClient();
      await wait(MCP_RETRY_DELAY_MS);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("MCP request failed after retry.");
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
