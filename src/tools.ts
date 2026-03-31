import toolsJson from "./tools.json" with { type: "json" };

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const toolDefinitions: ToolDefinition[] = toolsJson as ToolDefinition[];
