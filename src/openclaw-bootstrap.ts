import { existsSync } from "node:fs";
import {
  cp,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSON5 from "json5";
import {
  buildPluginEntryConfig,
  PLUGIN_ID,
  type SetupConfig,
} from "./plugin-config.js";

const LEGACY_STATE_DIRNAMES = [".clawdbot", ".moldbot"] as const;
const LEGACY_CONFIG_FILENAMES = ["clawdbot.json", "moldbot.json"] as const;
const NEW_STATE_DIRNAME = ".openclaw";
const CONFIG_FILENAME = "openclaw.json";
const DEFAULT_PACKAGE_FILES = ["dist", "openclaw.plugin.json", "README.md"];

export interface PackageManifest {
  name?: string;
  version?: string;
  main?: string;
  files?: unknown;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

export interface PackageContext {
  rootDir: string;
  manifest: PackageManifest;
}

export interface PackageInstallResult {
  replacedExisting: boolean;
  targetDir: string;
}

export async function loadPackageContext(
  fromFilePath: string
): Promise<PackageContext> {
  const rootDir = await findPackageRoot(path.dirname(fromFilePath));
  const manifest = await readPackageManifest(rootDir);

  return { rootDir, manifest };
}

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

export async function installPackageIntoOpenClaw(
  packageContext: PackageContext,
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir
): Promise<PackageInstallResult> {
  const extensionsDir = path.join(resolveOpenClawStateDir(env, homedir), "extensions");
  const targetDir = path.join(extensionsDir, PLUGIN_ID);
  const tempDir = path.join(
    extensionsDir,
    `${PLUGIN_ID}.tmp-${process.pid}-${Date.now()}`
  );
  const dependencySources = new Set<string>();

  await mkdir(extensionsDir, { recursive: true });
  await rm(tempDir, { recursive: true, force: true });

  try {
    await mkdir(tempDir, { recursive: true });
    await copyPublishedPackageFiles(packageContext.rootDir, tempDir, packageContext.manifest);
    await copyRuntimeDependencies(
      packageContext.rootDir,
      tempDir,
      packageContext.manifest,
      dependencySources
    );

    const replacedExisting = await pathExists(targetDir);
    if (replacedExisting) {
      await rm(targetDir, { recursive: true, force: true });
    }

    await rename(tempDir, targetDir);

    return {
      replacedExisting,
      targetDir,
    };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw new Error(`Failed to install AiToEarn plugin: ${formatError(error)}`);
  }
}

async function copyPublishedPackageFiles(
  sourceRoot: string,
  targetRoot: string,
  manifest: PackageManifest
): Promise<void> {
  const entries = resolvePublishedPackageEntries(manifest);

  for (const relativePath of entries) {
    const sourcePath = path.resolve(sourceRoot, relativePath);
    if (!isPathInside(sourceRoot, sourcePath)) {
      throw new Error(`Package file escapes root: ${relativePath}`);
    }

    if (!(await pathExists(sourcePath))) {
      continue;
    }

    const targetPath = path.resolve(targetRoot, relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await cp(sourcePath, targetPath, { recursive: true, force: true });
  }
}

async function copyRuntimeDependencies(
  packageDir: string,
  targetRoot: string,
  manifest: PackageManifest,
  seenSources: Set<string>
): Promise<void> {
  const dependencyNames = [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ];
  const optional = new Set(Object.keys(manifest.optionalDependencies ?? {}));

  for (const dependencyName of dependencyNames) {
    let dependencyRoot: string;

    try {
      dependencyRoot = await resolveDependencyRoot(dependencyName, packageDir);
    } catch (error) {
      if (optional.has(dependencyName)) {
        continue;
      }

      throw new Error(
        `Missing dependency "${dependencyName}" required by ${packageDir}: ${formatError(
          error
        )}`
      );
    }

    const normalizedSource = path.resolve(dependencyRoot);
    if (seenSources.has(normalizedSource)) {
      continue;
    }

    seenSources.add(normalizedSource);

    const dependencyManifest = await readPackageManifest(dependencyRoot);
    const relativeDependencyPath = resolveDependencyRelativePath(dependencyRoot);
    const targetDependencyDir = path.join(
      targetRoot,
      "node_modules",
      relativeDependencyPath
    );

    await copyDependencyDirectory(dependencyRoot, targetDependencyDir);
    await copyRuntimeDependencies(
      dependencyRoot,
      targetRoot,
      dependencyManifest,
      seenSources
    );
  }
}

async function copyDependencyDirectory(
  sourceDir: string,
  targetDir: string
): Promise<void> {
  await mkdir(path.dirname(targetDir), { recursive: true });
  await cp(sourceDir, targetDir, {
    recursive: true,
    force: true,
    filter: (entryPath) => path.basename(entryPath) !== "node_modules",
  });
}

async function resolveDependencyRoot(
  dependencyName: string,
  requesterDir: string
): Promise<string> {
  for (const nodeModulesDir of resolveNodeModulesSearchDirs(requesterDir)) {
    const dependencyRoot = path.join(nodeModulesDir, dependencyName);
    if (await pathExists(path.join(dependencyRoot, "package.json"))) {
      return dependencyRoot;
    }
  }

  throw new Error(
    `Could not locate installed package "${dependencyName}" from ${requesterDir}`
  );
}

function resolveDependencyRelativePath(dependencyRoot: string): string {
  const outermostNodeModulesDir = findOutermostNodeModulesDir(dependencyRoot);
  if (!outermostNodeModulesDir) {
    throw new Error(`Could not resolve node_modules root for ${dependencyRoot}`);
  }

  return path.relative(outermostNodeModulesDir, dependencyRoot);
}

function findOutermostNodeModulesDir(startPath: string): string | null {
  let current = path.resolve(startPath);
  let result: string | null = null;

  while (true) {
    if (path.basename(current) === "node_modules") {
      result = current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return result;
    }

    current = parent;
  }
}

function resolveNodeModulesSearchDirs(startDir: string): string[] {
  const results: string[] = [];
  let current = path.resolve(startDir);

  while (true) {
    results.push(path.join(current, "node_modules"));

    const parent = path.dirname(current);
    if (parent === current) {
      return results;
    }

    current = parent;
  }
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

function resolvePublishedPackageEntries(manifest: PackageManifest): string[] {
  const configuredFiles = Array.isArray(manifest.files)
    ? manifest.files
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];

  const entries = configuredFiles.length > 0 ? configuredFiles : DEFAULT_PACKAGE_FILES;

  return [...new Set(["package.json", ...entries])];
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

function existsSyncSafe(pathname: string): boolean {
  try {
    return existsSync(pathname);
  } catch {
    return false;
  }
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

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function cloneRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPathInside(rootDir: string, candidatePath: string): boolean {
  const relativePath = path.relative(path.resolve(rootDir), path.resolve(candidatePath));
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
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
