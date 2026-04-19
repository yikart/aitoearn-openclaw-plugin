import { spawn } from "node:child_process";
import { readFile, rename, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getPluginInstallRecord,
  readOpenClawConfig,
  resolveOpenClawStateDir,
  writeOpenClawConfig,
} from "../../shared/src/openclaw-config.js";
import { buildInstallSpec, PLUGIN_ID } from "../../shared/src/plugin-config.js";

export interface PackageManifest {
  name?: string;
  version?: string;
}

export interface PackageContext {
  rootDir: string;
  manifest: PackageManifest;
  runtimeInstallSpec: string;
  runtimeTrackSpec: string;
}

export type InstallAction = "install" | "update" | "migrate";

export interface InstallPluginResult {
  action: InstallAction;
}

interface InstallPluginParams {
  command: "auto" | "install" | "upgrade";
  currentConfig: Record<string, unknown>;
  packageContext: PackageContext;
}

interface RunOpenClawOptions {
  env?: NodeJS.ProcessEnv;
}

interface InstallPluginDeps {
  runOpenClaw: (args: string[], options?: RunOpenClawOptions) => Promise<void>;
  env?: NodeJS.ProcessEnv;
  homedir?: () => string;
  now?: () => number;
  pathExists?: (pathname: string) => Promise<boolean>;
  registries?: string[];
  readConfig?: typeof readOpenClawConfig;
  rename?: typeof rename;
  rm?: typeof rm;
  pid?: number;
  writeConfig?: typeof writeOpenClawConfig;
}

const DEFAULT_NPM_REGISTRIES = [
  "https://registry.npmjs.org/",
  "http://mirrors.cloud.tencent.com/npm/",
];
const OPENCLAW_COMMAND_NOT_FOUND = "OPENCLAW_COMMAND_NOT_FOUND";

export async function loadPackageContext(
  fromFilePath: string
): Promise<PackageContext> {
  const resolvedPath = fromFilePath.startsWith("file:")
    ? fileURLToPath(fromFilePath)
    : fromFilePath;
  const rootDir = await findPackageRoot(path.dirname(resolvedPath));
  const manifest = await readPackageManifest(rootDir);
  const version = manifest.version?.trim();

  if (!version) {
    throw new Error(`package.json in ${rootDir} is missing a version`);
  }

  return {
    rootDir,
    manifest,
    runtimeInstallSpec: buildInstallSpec(version),
    runtimeTrackSpec: buildInstallSpec(),
  };
}

export async function resolveInstallAction(
  config: Record<string, unknown>,
  deps: {
    legacyInstallDir: string;
    pathExists?: (pathname: string) => Promise<boolean>;
  }
): Promise<InstallAction> {
  const installRecord = getPluginInstallRecord(config);
  if (!installRecord) {
    const exists = await (deps.pathExists ?? pathExists)(deps.legacyInstallDir);
    return exists ? "migrate" : "install";
  }

  const source =
    typeof installRecord.source === "string" ? installRecord.source.trim() : "";
  if (source === "npm") {
    return "update";
  }

  throw new Error(
    `AiToEarn plugin is already installed from source "${source || "unknown"}". This installer only manages npm-installed copies. Remove the existing install first or switch it to npm.`
  );
}

export async function installPluginWithOpenClaw(
  params: InstallPluginParams,
  deps: InstallPluginDeps = {
    runOpenClaw,
  }
): Promise<InstallPluginResult> {
  const env = deps.env ?? process.env;
  const homedir = deps.homedir ?? os.homedir;
  const readConfig = deps.readConfig ?? readOpenClawConfig;
  const registries = normalizeRegistries(deps.registries);
  const legacyInstallDir = resolveLegacyInstallDir(env, homedir);
  const writeConfig = deps.writeConfig ?? writeOpenClawConfig;
  const runWithRegistryFallback = async (args: string[]) => {
    await runOpenClawWithRegistryFallback({
      args,
      env,
      registries,
      runOpenClaw: deps.runOpenClaw,
    });
  };
  const action = await resolveInstallAction(params.currentConfig, {
    legacyInstallDir,
    pathExists: deps.pathExists,
  });

  if (action === "update") {
    await runWithRegistryFallback(["plugins", "update", PLUGIN_ID]);
    return { action };
  }

  if (action === "migrate") {
    await migrateLegacyInstall({
      legacyInstallDir,
      packageContext: params.packageContext,
      runOpenClaw: runWithRegistryFallback,
      pathExists: deps.pathExists ?? pathExists,
      readConfig,
      rename: deps.rename ?? rename,
      rm: deps.rm ?? rm,
      now: deps.now ?? (() => Date.now()),
      pid: deps.pid ?? process.pid,
      writeConfig,
      env,
      homedir,
    });
    return { action };
  }

  await runWithRegistryFallback([
    "plugins",
    "install",
    params.packageContext.runtimeInstallSpec,
  ]);
  await normalizeInstalledRuntimeSpec({
    packageContext: params.packageContext,
    readConfig,
    writeConfig,
    env,
    homedir,
  });

  return { action };
}

export function resolveLegacyInstallDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir
): string {
  return path.join(resolveOpenClawStateDir(env, homedir), "extensions", PLUGIN_ID);
}

async function findPackageRoot(startDir: string): Promise<string> {
  let current = path.resolve(startDir);

  while (true) {
    const manifestPath = path.join(current, "package.json");
    if (await pathExists(manifestPath)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Could not find package.json above ${startDir}`);
    }

    current = parent;
  }
}

async function readPackageManifest(packageDir: string): Promise<PackageManifest> {
  const manifestPath = path.join(packageDir, "package.json");
  const raw = await readFile(manifestPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (!isRecord(parsed)) {
    throw new Error(`package.json in ${packageDir} is not an object`);
  }

  return parsed as PackageManifest;
}

async function pathExists(pathname: string): Promise<boolean> {
  try {
    await stat(pathname);
    return true;
  } catch (error) {
    if (isMissingFileError(error)) {
      return false;
    }

    throw error;
  }
}

async function migrateLegacyInstall(params: {
  legacyInstallDir: string;
  packageContext: PackageContext;
  runOpenClaw: (args: string[]) => Promise<void>;
  pathExists: (pathname: string) => Promise<boolean>;
  readConfig: typeof readOpenClawConfig;
  rename: typeof rename;
  rm: typeof rm;
  now: () => number;
  pid: number;
  writeConfig: typeof writeOpenClawConfig;
  env: NodeJS.ProcessEnv;
  homedir: () => string;
}): Promise<void> {
  const backupDir = `${params.legacyInstallDir}.legacy-backup-${params.pid}-${params.now()}`;

  await params.rename(params.legacyInstallDir, backupDir);

  try {
    await params.runOpenClaw([
      "plugins",
      "install",
      params.packageContext.runtimeInstallSpec,
    ]);
    await normalizeInstalledRuntimeSpec({
      packageContext: params.packageContext,
      readConfig: params.readConfig,
      writeConfig: params.writeConfig,
      env: params.env,
      homedir: params.homedir,
    });
  } catch (error) {
    try {
      if (await params.pathExists(params.legacyInstallDir)) {
        await params.rm(params.legacyInstallDir, { recursive: true, force: true });
      }
      await params.rename(backupDir, params.legacyInstallDir);
    } catch (restoreError) {
      throw new Error(
        `Failed to migrate legacy AiToEarn plugin install: ${formatError(
          error
        )}. Also failed to restore the legacy install from ${backupDir}: ${formatError(
          restoreError
        )}`
      );
    }

    throw error;
  }

  try {
    await params.rm(backupDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup. The migrated install is already usable.
  }
}

async function normalizeInstalledRuntimeSpec(params: {
  packageContext: PackageContext;
  readConfig: typeof readOpenClawConfig;
  writeConfig: typeof writeOpenClawConfig;
  env: NodeJS.ProcessEnv;
  homedir: () => string;
}): Promise<void> {
  const config = await params.readConfig(params.env, params.homedir);
  const installRecord = getPluginInstallRecord(config);

  if (!installRecord || installRecord.source !== "npm") {
    return;
  }

  const currentSpec =
    typeof installRecord.spec === "string" ? installRecord.spec.trim() : "";
  if (
    !currentSpec ||
    currentSpec === params.packageContext.runtimeTrackSpec ||
    currentSpec !== params.packageContext.runtimeInstallSpec
  ) {
    return;
  }

  const plugins = cloneRecord(config.plugins);
  const installs = cloneRecord(plugins.installs);
  installs[PLUGIN_ID] = {
    ...installRecord,
    spec: params.packageContext.runtimeTrackSpec,
  };
  plugins.installs = installs;

  await params.writeConfig(
    {
      ...config,
      plugins,
    },
    params.env,
    params.homedir
  );
}

async function runOpenClawWithRegistryFallback(params: {
  args: string[];
  env: NodeJS.ProcessEnv;
  registries: string[];
  runOpenClaw: (args: string[], options?: RunOpenClawOptions) => Promise<void>;
}): Promise<void> {
  let lastError: unknown = null;

  for (const registry of params.registries) {
    try {
      await params.runOpenClaw(params.args, {
        env: {
          ...params.env,
          npm_config_registry: registry,
          NPM_CONFIG_REGISTRY: registry,
        },
      });
      return;
    } catch (error) {
      lastError = error;

      if (isOpenClawCommandNotFoundError(error)) {
        throw error;
      }
    }
  }

  throw new Error(
    `OpenClaw CLI command failed after trying registries ${params.registries.join(
      ", "
    )}: ${formatError(lastError)}`
  );
}

function normalizeRegistries(registries?: string[]): string[] {
  const values = (registries ?? DEFAULT_NPM_REGISTRIES).map((value) => value.trim());
  const filtered = values.filter(Boolean);

  return filtered.length > 0 ? [...new Set(filtered)] : [...DEFAULT_NPM_REGISTRIES];
}

function runOpenClaw(
  args: string[],
  options: RunOpenClawOptions = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("openclaw", args, {
      stdio: "inherit",
      env: options.env ?? process.env,
      shell: process.platform === "win32",
    });

    child.once("error", (error) => {
      if (isMissingProcessError(error)) {
        reject(createOpenClawCommandNotFoundError());
        return;
      }

      reject(new Error(`Failed to start OpenClaw CLI: ${formatError(error)}`));
    });

    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const details = signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`;
      reject(
        new Error(
          `OpenClaw CLI command failed (${details}): openclaw ${args.join(" ")}`
        )
      );
    });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

function isMissingProcessError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

function createOpenClawCommandNotFoundError(): Error {
  const error = new Error(
    'Could not find the "openclaw" command in PATH. Install OpenClaw on the host first, then rerun this installer.'
  ) as Error & { code?: string };
  error.code = OPENCLAW_COMMAND_NOT_FOUND;
  return error;
}

function isOpenClawCommandNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === OPENCLAW_COMMAND_NOT_FOUND
  );
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
