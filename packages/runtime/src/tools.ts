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

type JsonSchema = boolean | Record<string, unknown>;

const RECORD_OF_SCHEMAS_KEYS = [
  "$defs",
  "definitions",
  "dependentSchemas",
  "patternProperties",
  "properties",
] as const;

const SINGLE_SCHEMA_KEYS = [
  "additionalProperties",
  "contains",
  "else",
  "if",
  "not",
  "propertyNames",
  "then",
  "unevaluatedItems",
  "unevaluatedProperties",
] as const;

const ARRAY_OF_SCHEMAS_KEYS = ["allOf", "anyOf", "oneOf", "prefixItems"] as const;

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
    inputSchema: normalizeToolInputSchema(value.inputSchema),
  };
}

export function normalizeToolInputSchema(
  inputSchema: Record<string, unknown>
): Record<string, unknown> {
  const normalized = normalizeJsonSchema(inputSchema);
  return isRecord(normalized) ? normalized : inputSchema;
}

function normalizeJsonSchema(schema: JsonSchema): JsonSchema {
  if (typeof schema === "boolean") {
    return schema;
  }

  const normalized: Record<string, unknown> = { ...schema };
  applyLegacySchemaIdCompatibility(normalized);

  for (const key of RECORD_OF_SCHEMAS_KEYS) {
    const value = normalized[key];
    if (isRecord(value)) {
      normalized[key] = normalizeSchemaRecordMap(value);
    }
  }

  for (const key of SINGLE_SCHEMA_KEYS) {
    const value = normalized[key];
    if (isJsonSchema(value)) {
      normalized[key] = normalizeJsonSchema(value);
    }
  }

  for (const key of ARRAY_OF_SCHEMAS_KEYS) {
    const value = normalized[key];
    if (Array.isArray(value)) {
      normalized[key] = normalizeSchemaArray(value);
    }
  }

  const items = normalized.items;
  if (Array.isArray(items)) {
    applyTupleItemsCompatibility(normalized, items);
  } else if (isJsonSchema(items)) {
    normalized.items = normalizeJsonSchema(items);
  }

  return normalized;
}

function applyLegacySchemaIdCompatibility(schema: Record<string, unknown>): void {
  if (!Object.prototype.hasOwnProperty.call(schema, "id")) {
    return;
  }

  if (typeof schema.id === "string" && !Object.prototype.hasOwnProperty.call(schema, "$id")) {
    schema.$id = schema.id;
  }

  delete schema.id;
}

function normalizeSchemaRecordMap(
  values: Record<string, unknown>
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(values)) {
    normalized[key] = isJsonSchema(value) ? normalizeJsonSchema(value) : value;
  }

  return normalized;
}

function normalizeSchemaArray(values: unknown[]): unknown[] {
  return values.map((value) =>
    isJsonSchema(value) ? normalizeJsonSchema(value) : value
  );
}

function applyTupleItemsCompatibility(
  schema: Record<string, unknown>,
  tupleItems: unknown[]
): void {
  if (tupleItems.length === 0 || !tupleItems.every(isJsonSchema)) {
    return;
  }

  const schemaTupleItems = tupleItems as JsonSchema[];
  const normalizedItems = schemaTupleItems.map((value) =>
    normalizeJsonSchema(value)
  );
  const uniqueItems = dedupeSchemas(normalizedItems);

  if (uniqueItems.length === 1) {
    schema.items = uniqueItems[0];
    delete schema.prefixItems;
  } else {
    schema.prefixItems = normalizedItems;
    schema.items = false;
  }

  schema.minItems = tupleItems.length;
  schema.maxItems = tupleItems.length;
  delete schema.additionalItems;
}

function dedupeSchemas(values: JsonSchema[]): JsonSchema[] {
  const unique = new Map<string, JsonSchema>();

  for (const value of values) {
    unique.set(stableSerialize(value), value);
  }

  return [...unique.values()];
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }

  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value) ?? String(value);
}

function isJsonSchema(value: unknown): value is JsonSchema {
  return typeof value === "boolean" || isRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
