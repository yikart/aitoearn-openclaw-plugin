import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSON5 from "json5";
import {
  buildPluginEntryConfig,
  configSchema,
  PLUGIN_ID,
  type SetupConfig,
} from "./plugin-config.js";

const LEGACY_STATE_DIRNAMES = [".clawdbot", ".moldbot"] as const;
const LEGACY_CONFIG_FILENAMES = ["clawdbot.json", "moldbot.json"] as const;
const NEW_STATE_DIRNAME = ".openclaw";
const CONFIG_FILENAME = "openclaw.json";

export function resolveOpenClawStateDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir
): string {
  const override = env.OPENCLAW_STATE_DIR?.trim();
  if (override) {
    return resolveUserPath(override, homedir);
  }

  const newDir = path.join(homedir(), NEW_STATE_DIRNAME);
  if (env.OPENCLAW_TEST_FAST === "1") {
    return newDir;
  }

  for (const dirname of LEGACY_STATE_DIRNAMES) {
    const candidate = path.join(homedir(), dirname);
    if (existsSyncSafe(candidate)) {
      return candidate;
    }
  }

  return newDir;
}

export function resolveOpenClawConfigPath(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir
): string {
  const override = env.OPENCLAW_CONFIG_PATH?.trim();
  if (override) {
    return resolveUserPath(override, homedir);
  }

  const stateDir = resolveOpenClawStateDir(env, homedir);
  const stateOverride = env.OPENCLAW_STATE_DIR?.trim();
  const existingStateConfig = findExistingConfigInStateDir(stateDir);

  if (existingStateConfig) {
    return existingStateConfig;
  }

  if (stateOverride || env.OPENCLAW_TEST_FAST === "1") {
    return path.join(stateDir, CONFIG_FILENAME);
  }

  for (const candidate of resolveDefaultConfigCandidates(homedir)) {
    if (existsSyncSafe(candidate)) {
      return candidate;
    }
  }

  return path.join(stateDir, CONFIG_FILENAME);
}

export async function readOpenClawConfig(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir
): Promise<Record<string, unknown>> {
  const configPath = resolveOpenClawConfigPath(env, homedir);

  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON5.parse(stripBom(raw));
    return isRecord(parsed) ? parsed : {};
  } catch (error) {
    if (isMissingFileError(error)) {
      return {};
    }

    throw new Error(
      `Failed to read OpenClaw config ${configPath}: ${formatError(error)}`
    );
  }
}

export async function writeOpenClawConfig(
  config: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir
): Promise<string> {
  const configPath = resolveOpenClawConfigPath(env, homedir);
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return configPath;
}

export function applySetupConfigToOpenClawConfig(
  config: Record<string, unknown>,
  setupConfig: SetupConfig
): Record<string, unknown> {
  const next = cloneRecord(config);
  const plugins = cloneRecord(next.plugins);
  const entries = cloneRecord(plugins.entries);

  entries[PLUGIN_ID] = buildPluginEntryConfig(setupConfig);
  plugins.entries = entries;
  next.plugins = plugins;

  return next;
}

export function hasConfiguredPluginEntry(
  config: Record<string, unknown>,
  pluginId = PLUGIN_ID
): boolean {
  const plugins = asRecord(config.plugins);
  const entries = asRecord(plugins?.entries);
  const pluginEntry = asRecord(entries?.[pluginId]);
  const parsed = configSchema.safeParse(pluginEntry?.config ?? {});

  if (!parsed.success) {
    return false;
  }

  const apiKey = parsed.data.apiKey;
  if (typeof apiKey === "string") {
    return apiKey.trim().length > 0;
  }

  return isRecord(apiKey);
}

export function getPluginInstallRecord(
  config: Record<string, unknown>,
  pluginId = PLUGIN_ID
): Record<string, unknown> | null {
  const plugins = asRecord(config.plugins);
  const installs = asRecord(plugins?.installs);
  return asRecord(installs?.[pluginId]);
}

function resolveDefaultConfigCandidates(homedir: () => string): string[] {
  const candidates: string[] = [];
  const defaultStateDirs = [
    path.join(homedir(), NEW_STATE_DIRNAME),
    ...LEGACY_STATE_DIRNAMES.map((dirname) => path.join(homedir(), dirname)),
  ];

  for (const stateDir of defaultStateDirs) {
    candidates.push(path.join(stateDir, CONFIG_FILENAME));
    for (const filename of LEGACY_CONFIG_FILENAMES) {
      candidates.push(path.join(stateDir, filename));
    }
  }

  return candidates;
}

function findExistingConfigInStateDir(stateDir: string): string | null {
  const candidates = [
    path.join(stateDir, CONFIG_FILENAME),
    ...LEGACY_CONFIG_FILENAMES.map((filename) => path.join(stateDir, filename)),
  ];

  for (const candidate of candidates) {
    if (existsSyncSafe(candidate)) {
      return candidate;
    }
  }

  return null;
}

function resolveUserPath(input: string, homedir: () => string): string {
  if (input === "~") {
    return homedir();
  }

  if (input.startsWith("~/")) {
    return path.join(homedir(), input.slice(2));
  }

  return path.resolve(input);
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function cloneRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function existsSyncSafe(pathname: string): boolean {
  try {
    return existsSync(pathname);
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
