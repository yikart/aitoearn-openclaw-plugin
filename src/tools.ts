export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolSnapshot {
  version: 1;
  syncedAt: string;
  tools: ToolDefinition[];
}

export type ToolDiscoveryHelperResult =
  | {
      status: "ok";
      tools: ToolDefinition[];
      invalidCount: number;
      duplicateCount: number;
    }
  | {
      status: "not_configured";
    }
  | {
      status: "config_error" | "sync_error";
      message: string;
    };

export interface SanitizedToolsResult {
  tools: ToolDefinition[];
  invalidCount: number;
  duplicateCount: number;
}

export interface ParsedToolSnapshotResult extends SanitizedToolsResult {
  snapshot: ToolSnapshot | null;
}

export function sanitizeToolDefinitions(values: unknown): SanitizedToolsResult {
  if (!Array.isArray(values)) {
    return { tools: [], invalidCount: 0, duplicateCount: 0 };
  }

  const tools: ToolDefinition[] = [];
  const seenNames = new Set<string>();
  let invalidCount = 0;
  let duplicateCount = 0;

  for (const value of values) {
    const normalized = normalizeToolDefinition(value);
    if (!normalized) {
      invalidCount += 1;
      continue;
    }

    if (seenNames.has(normalized.name)) {
      duplicateCount += 1;
      continue;
    }

    seenNames.add(normalized.name);
    tools.push(normalized);
  }

  return { tools, invalidCount, duplicateCount };
}

export function createToolSnapshot(
  tools: ToolDefinition[],
  syncedAt = new Date().toISOString()
): ToolSnapshot {
  return {
    version: 1,
    syncedAt,
    tools,
  };
}

export function parseToolSnapshot(value: unknown): ParsedToolSnapshotResult {
  if (Array.isArray(value)) {
    const sanitized = sanitizeToolDefinitions(value);
    return {
      ...sanitized,
      snapshot: createToolSnapshot(sanitized.tools),
    };
  }

  if (!isRecord(value) || !Array.isArray(value.tools)) {
    return {
      snapshot: null,
      tools: [],
      invalidCount: 0,
      duplicateCount: 0,
    };
  }

  const sanitized = sanitizeToolDefinitions(value.tools);
  const syncedAt =
    typeof value.syncedAt === "string" && value.syncedAt.trim()
      ? value.syncedAt
      : new Date(0).toISOString();

  return {
    ...sanitized,
    snapshot: {
      version: 1,
      syncedAt,
      tools: sanitized.tools,
    },
  };
}

export function parseToolDiscoveryHelperResult(
  value: unknown
): ToolDiscoveryHelperResult | null {
  if (!isRecord(value) || typeof value.status !== "string") {
    return null;
  }

  if (value.status === "ok") {
    const sanitized = sanitizeToolDefinitions(value.tools);
    return {
      status: "ok",
      tools: sanitized.tools,
      invalidCount:
        typeof value.invalidCount === "number"
          ? value.invalidCount
          : sanitized.invalidCount,
      duplicateCount:
        typeof value.duplicateCount === "number"
          ? value.duplicateCount
          : sanitized.duplicateCount,
    };
  }

  if (value.status === "not_configured") {
    return { status: "not_configured" };
  }

  if (
    (value.status === "config_error" || value.status === "sync_error") &&
    typeof value.message === "string"
  ) {
    return {
      status: value.status,
      message: value.message,
    };
  }

  return null;
}

function normalizeToolDefinition(value: unknown): ToolDefinition | null {
  if (!isRecord(value) || typeof value.name !== "string") {
    return null;
  }

  const name = value.name.trim();
  if (!name || !isRecord(value.inputSchema)) {
    return null;
  }

  return {
    name,
    description:
      typeof value.description === "string" ? value.description : "",
    inputSchema: value.inputSchema,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
