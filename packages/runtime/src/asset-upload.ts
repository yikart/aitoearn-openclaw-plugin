import { basename, extname, isAbsolute, resolve } from "node:path";
import { readFile, stat } from "node:fs/promises";

export const ASSET_TYPE_VALUES = [
  "aiImage",
  "aiVideo",
  "aiCard",
  "aiChatImage",
  "aideoOutput",
  "videoEdit",
  "dramaRecap",
  "styleTransfer",
  "imageEdit",
  "subtitle",
  "userMedia",
  "userFile",
  "publishMedia",
  "avatar",
  "agentSession",
  "videoThumbnail",
  "googlePlace",
  "brandLibrary",
  "temp",
] as const;

type AssetType = (typeof ASSET_TYPE_VALUES)[number];
type FetchLike = typeof fetch;

interface UploadAssetApiEnvelope {
  code?: unknown;
  message?: unknown;
  data?: unknown;
}

interface UploadSignData {
  id?: unknown;
  uploadUrl?: unknown;
}

interface ConfirmedAssetData {
  id?: unknown;
  path?: unknown;
  url?: unknown;
  type?: unknown;
  size?: unknown;
  mimeType?: unknown;
  filename?: unknown;
}

export interface UploadAssetFromPathInput {
  apiKey: string;
  baseUrl: string;
  filePath: string;
  type?: string;
  filename?: string;
  contentType?: string;
  cwd?: string;
  fetchImpl?: FetchLike;
}

export interface UploadedAssetResult {
  id: string;
  path: string;
  url: string;
  type: string;
  filename: string;
  size: number;
  contentType: string;
  filePath: string;
}

const ASSET_TYPE_SET = new Set<string>(ASSET_TYPE_VALUES);

const CONTENT_TYPES_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".json": "application/json",
  ".txt": "text/plain",
  ".pdf": "application/pdf",
};

export async function uploadAssetFromPath(
  input: UploadAssetFromPathInput
): Promise<UploadedAssetResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const resolvedFilePath = resolveFilePath(input.filePath, input.cwd);
  const resolvedType = resolveAssetType(input.type);
  const resolvedFilename = resolveFilename(input.filename, resolvedFilePath);
  const fileStat = await getFileStat(resolvedFilePath);
  const fileContent = await readFile(resolvedFilePath);
  const resolvedContentType = resolveContentType(
    input.contentType,
    resolvedFilename
  );

  const uploadSignResponse = await fetchJson(
    `${input.baseUrl}/assets/uploadSign`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": input.apiKey,
      },
      body: JSON.stringify({
        filename: resolvedFilename,
        type: resolvedType,
        size: fileStat.size,
      }),
    },
    "asset uploadSign",
    fetchImpl
  );
  const uploadSignData = unwrapApiData<UploadSignData>(
    uploadSignResponse,
    "asset uploadSign"
  );
  const assetId = requireStringField(uploadSignData, "id", "asset uploadSign");
  const uploadUrl = requireStringField(
    uploadSignData,
    "uploadUrl",
    "asset uploadSign"
  );

  const putResponse = await fetchImpl(uploadUrl, {
    method: "PUT",
    headers: {
      "content-type": resolvedContentType,
    },
    body: fileContent,
  });
  if (!putResponse.ok) {
    throw new Error(
      `asset upload PUT failed with HTTP ${putResponse.status}${
        await formatResponseSuffix(putResponse)
      }`
    );
  }

  const confirmResponse = await fetchJson(
    `${input.baseUrl}/assets/${encodeURIComponent(assetId)}/confirm`,
    {
      method: "POST",
      headers: {
        "x-api-key": input.apiKey,
      },
    },
    "asset confirm",
    fetchImpl
  );
  const confirmedAsset = unwrapApiData<ConfirmedAssetData>(
    confirmResponse,
    "asset confirm"
  );

  return {
    id: requireStringField(confirmedAsset, "id", "asset confirm"),
    path: requireStringField(confirmedAsset, "path", "asset confirm"),
    url: requireStringField(confirmedAsset, "url", "asset confirm"),
    type: normalizeOptionalString(confirmedAsset.type) ?? resolvedType,
    filename: normalizeOptionalString(confirmedAsset.filename) ?? resolvedFilename,
    size:
      typeof confirmedAsset.size === "number" && Number.isFinite(confirmedAsset.size)
        ? confirmedAsset.size
        : fileStat.size,
    contentType:
      normalizeOptionalString(confirmedAsset.mimeType) ?? resolvedContentType,
    filePath: resolvedFilePath,
  };
}

function resolveFilePath(filePath: string, cwd = process.cwd()): string {
  const trimmed = filePath.trim();
  if (!trimmed) {
    throw new Error("uploadAssetFromPath requires a non-empty filePath.");
  }

  return isAbsolute(trimmed) ? trimmed : resolve(cwd, trimmed);
}

function resolveAssetType(type?: string): AssetType {
  const trimmed = type?.trim() || "temp";
  if (ASSET_TYPE_SET.has(trimmed)) {
    return trimmed as AssetType;
  }

  throw new Error(
    `uploadAssetFromPath received unsupported type "${trimmed}". Supported values: ${ASSET_TYPE_VALUES.join(
      ", "
    )}.`
  );
}

function resolveFilename(filename: string | undefined, filePath: string): string {
  const candidate = filename?.trim() ? basename(filename.trim()) : basename(filePath);
  if (!candidate) {
    throw new Error(
      `uploadAssetFromPath could not determine filename for filePath: ${filePath}`
    );
  }

  return candidate;
}

async function getFileStat(filePath: string) {
  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch (error) {
    if (isMissingFileError(error)) {
      throw new Error(`uploadAssetFromPath could not find file: ${filePath}`);
    }
    throw error;
  }

  if (!fileStat.isFile()) {
    throw new Error(
      `uploadAssetFromPath expected filePath to point to a file: ${filePath}`
    );
  }

  return fileStat;
}

function resolveContentType(contentType: string | undefined, filename: string): string {
  const trimmed = contentType?.trim();
  if (trimmed) {
    return trimmed;
  }

  return (
    CONTENT_TYPES_BY_EXTENSION[extname(filename).toLowerCase()] ??
    "application/octet-stream"
  );
}

async function fetchJson(
  url: string,
  init: RequestInit,
  operation: string,
  fetchImpl: FetchLike
): Promise<unknown> {
  const response = await fetchImpl(url, init);
  if (!response.ok) {
    throw new Error(
      `${operation} failed with HTTP ${response.status}${await formatResponseSuffix(
        response
      )}`
    );
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new Error(`${operation} returned a non-JSON response.`);
  }
}

function unwrapApiData<T>(payload: unknown, operation: string): T {
  if (!isRecord(payload)) {
    throw new Error(`${operation} returned an invalid response payload.`);
  }

  const envelope = payload as UploadAssetApiEnvelope;
  if (
    typeof envelope.code === "number" &&
    envelope.code !== 0 &&
    envelope.code !== 200
  ) {
    const message = normalizeOptionalString(envelope.message);
    throw new Error(
      `${operation} failed: ${message ?? `unexpected code ${envelope.code}`}`
    );
  }

  if (envelope.data === undefined || envelope.data === null) {
    throw new Error(`${operation} response is missing data.`);
  }

  return envelope.data as T;
}

function requireStringField(
  value: unknown,
  key: string,
  operation: string
): string {
  if (!isRecord(value)) {
    throw new Error(`${operation} response is missing data.${key}.`);
  }

  const fieldValue = value[key];
  if (typeof fieldValue !== "string" || !fieldValue.trim()) {
    throw new Error(`${operation} response is missing data.${key}.`);
  }

  return fieldValue.trim();
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function formatResponseSuffix(response: Response): Promise<string> {
  try {
    const text = (await response.text()).trim();
    return text ? `: ${text}` : "";
  } catch {
    return "";
  }
}

function isMissingFileError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
