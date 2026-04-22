const DELETE_VALUE = Symbol("delete-tool-param");

const PLACEHOLDER_TEXT_PATTERNS = [
  /^null$/i,
  /^undefined$/i,
  /^n\/?a$/i,
  /^none$/i,
  /^unknown$/i,
  /^placeholder(?:[-_\s].*)?$/i,
  /^remove[-_\s]?me$/i,
  /^to[-_\s]?do$/i,
  /^tbd$/i,
  /^change[-_\s]?me$/i,
  /^dummy$/i,
  /^example$/i,
  /^sample$/i,
  /^test$/i,
  /^fake$/i,
] as const;

const COMPOSED_SCHEMA_KEYS = ["allOf", "anyOf", "oneOf"] as const;

type JsonSchema = boolean | Record<string, unknown>;
type SanitizedValue =
  | typeof DELETE_VALUE
  | null
  | undefined
  | string
  | number
  | boolean
  | unknown[]
  | Record<string, unknown>;

export function sanitizeToolParams(
  params: Record<string, unknown>,
  inputSchema: Record<string, unknown>
): Record<string, unknown> {
  const sanitized = sanitizeObjectValue(params, inputSchema, false);
  return isRecord(sanitized) ? sanitized : {};
}

function sanitizeValue(
  value: unknown,
  schema: JsonSchema | undefined,
  isRequired: boolean
): SanitizedValue {
  if (value === undefined || value === null) {
    return isRequired ? value : DELETE_VALUE;
  }

  if (typeof value === "string") {
    return sanitizeStringValue(value, isRequired);
  }

  if (Array.isArray(value)) {
    return sanitizeArrayValue(value, schema, isRequired);
  }

  if (isRecord(value)) {
    return sanitizeObjectValue(value, schema, isRequired);
  }

  return value as SanitizedValue;
}

function sanitizeStringValue(
  value: string,
  isRequired: boolean
): SanitizedValue {
  const trimmed = value.trim();
  if (!trimmed) {
    return DELETE_VALUE;
  }

  if (isPlaceholderValue(trimmed)) {
    return isRequired ? value : DELETE_VALUE;
  }

  return value;
}

function sanitizeArrayValue(
  value: unknown[],
  schema: JsonSchema | undefined,
  isRequired: boolean
): SanitizedValue {
  const sanitizedItems: unknown[] = [];

  for (const [index, item] of value.entries()) {
    const itemSchema = getArrayItemSchema(schema, index);
    const sanitized = sanitizeValue(item, itemSchema, false);
    if (sanitized !== DELETE_VALUE) {
      sanitizedItems.push(sanitized);
    }
  }

  if (sanitizedItems.length === 0) {
    return isRequired && containsNonBlankValue(value) ? value : DELETE_VALUE;
  }

  return sanitizedItems;
}

function sanitizeObjectValue(
  value: Record<string, unknown>,
  schema: JsonSchema | undefined,
  isRequired: boolean
): SanitizedValue {
  const properties = getSchemaProperties(schema);
  const required = getSchemaRequiredSet(schema);
  const sanitizedEntries: Array<[string, unknown]> = [];

  for (const [key, childValue] of Object.entries(value)) {
    const childSchema = properties[key];
    const sanitized = sanitizeValue(childValue, childSchema, required.has(key));
    if (sanitized !== DELETE_VALUE) {
      sanitizedEntries.push([key, sanitized]);
    }
  }

  if (sanitizedEntries.length === 0) {
    return isRequired && containsNonBlankValue(value) ? value : DELETE_VALUE;
  }

  return Object.fromEntries(sanitizedEntries);
}

function getSchemaProperties(
  schema: JsonSchema | undefined
): Record<string, JsonSchema | undefined> {
  if (!isRecord(schema)) {
    return {};
  }

  const properties: Record<string, JsonSchema | undefined> = {};

  if (isRecord(schema.properties)) {
    for (const [key, value] of Object.entries(schema.properties)) {
      properties[key] = isJsonSchema(value) ? value : undefined;
    }
  }

  for (const childSchema of getComposedSchemas(schema)) {
    for (const [key, value] of Object.entries(getSchemaProperties(childSchema))) {
      if (!Object.prototype.hasOwnProperty.call(properties, key)) {
        properties[key] = value;
      }
    }
  }

  return properties;
}

function getSchemaRequiredSet(schema: JsonSchema | undefined): Set<string> {
  if (!isRecord(schema)) {
    return new Set();
  }

  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((value): value is string => typeof value === "string")
      : []
  );

  for (const childSchema of getComposedSchemas(schema, ["allOf"])) {
    for (const key of getSchemaRequiredSet(childSchema)) {
      required.add(key);
    }
  }

  return required;
}

function getArrayItemSchema(
  schema: JsonSchema | undefined,
  index: number
): JsonSchema | undefined {
  if (!isRecord(schema)) {
    return undefined;
  }

  if (Array.isArray(schema.prefixItems)) {
    const prefixItem = schema.prefixItems[index];
    if (isJsonSchema(prefixItem)) {
      return prefixItem;
    }
  }

  if (isJsonSchema(schema.items)) {
    return schema.items;
  }

  for (const childSchema of getComposedSchemas(schema)) {
    const itemSchema = getArrayItemSchema(childSchema, index);
    if (itemSchema) {
      return itemSchema;
    }
  }

  return undefined;
}

function getComposedSchemas(
  schema: Record<string, unknown>,
  keys: ReadonlyArray<(typeof COMPOSED_SCHEMA_KEYS)[number]> = COMPOSED_SCHEMA_KEYS
): JsonSchema[] {
  const schemas: JsonSchema[] = [];

  for (const key of keys) {
    const value = schema[key];
    if (!Array.isArray(value)) {
      continue;
    }

    for (const childSchema of value) {
      if (isJsonSchema(childSchema)) {
        schemas.push(childSchema);
      }
    }
  }

  return schemas;
}

function isPlaceholderValue(value: string): boolean {
  if (isPlaceholderUrl(value)) {
    return true;
  }

  return PLACEHOLDER_TEXT_PATTERNS.some((pattern) => pattern.test(value));
}

function isPlaceholderUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (hostname.endsWith(".invalid")) {
      return true;
    }

    return value === "https://placeholder.invalid/remove-me";
  } catch {
    return false;
  }
}

function containsNonBlankValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsNonBlankValue(item));
  }

  if (isRecord(value)) {
    return Object.values(value).some((item) => containsNonBlankValue(item));
  }

  return true;
}

function isJsonSchema(value: unknown): value is JsonSchema {
  return typeof value === "boolean" || isRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
