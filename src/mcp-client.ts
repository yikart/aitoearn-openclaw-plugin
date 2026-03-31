import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

let mcpClient: Client | null = null;
let currentApiKey: string | null = null;
let currentBaseUrl: string | null = null;

export async function getMcpClient(
  apiKey: string,
  baseUrl: string
): Promise<Client> {
  // 如果配置没变且客户端已连接，复用
  if (mcpClient && currentApiKey === apiKey && currentBaseUrl === baseUrl) {
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
