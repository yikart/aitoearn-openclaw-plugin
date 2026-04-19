import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = path.join(rootDir, ".tmp");
const npmEnv = createNestedNpmEnv();

mkdirSync(tempRoot, { recursive: true });

runNpm(["run", "build", "--workspace", "@aitoearn/openclaw-plugin"]);

const packOutput = runNpm([
  "pack",
  "--json",
  "--workspace",
  "@aitoearn/openclaw-plugin",
]);
const packEntries = JSON.parse(packOutput);
const tarballName =
  Array.isArray(packEntries) && typeof packEntries[0]?.filename === "string"
    ? packEntries[0].filename
    : undefined;

if (!tarballName) {
  throw new Error("npm pack did not produce a runtime tarball name.");
}

const tarballPath = path.join(rootDir, tarballName);
const tempDir = path.join(
  tempRoot,
  `runtime-package-smoke-${process.pid}-${Date.now()}`
);

mkdirSync(tempDir, { recursive: true });

try {
  execFileSync("tar", ["-xzf", tarballPath, "-C", tempDir], {
    cwd: rootDir,
    stdio: "pipe",
  });

  const packageDir = path.join(tempDir, "package");
  const packedManifest = JSON.parse(
    readFileSync(path.join(packageDir, "package.json"), "utf8")
  );
  const packedDependencies =
    packedManifest && typeof packedManifest === "object"
      ? packedManifest.dependencies
      : undefined;

  if (
    packedDependencies &&
    typeof packedDependencies === "object" &&
    "openclaw" in packedDependencies
  ) {
    throw new Error(
      'Runtime package still declares "openclaw" in dependencies.'
    );
  }

  if (!existsSync(path.join(packageDir, "openclaw.plugin.json"))) {
    throw new Error("Packed runtime package is missing openclaw.plugin.json.");
  }

  runNpm(
    ["install", "--ignore-scripts", "--omit=dev", "--no-package-lock"],
    packageDir
  );

  if (existsSync(path.join(packageDir, "node_modules", "openclaw"))) {
    throw new Error(
      'Runtime package unexpectedly installed "openclaw" as a local dependency.'
    );
  }

  console.log("Runtime package smoke passed.");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
  rmSync(tarballPath, { force: true });
}

function runNpm(args, cwd = rootDir) {
  return execFileSync("npm", args, {
    cwd,
    encoding: "utf8",
    env: npmEnv,
  });
}

function createNestedNpmEnv() {
  const env = { ...process.env };
  const keysToUnset = [
    "npm_command",
    "npm_config_workspace",
    "npm_execpath",
    "npm_lifecycle_event",
    "npm_lifecycle_script",
    "npm_package_json",
    "npm_package_name",
    "npm_package_version",
  ];

  for (const key of keysToUnset) {
    delete env[key];
  }

  env.npm_config_cache = path.join(os.tmpdir(), "aitoearn-openclaw-npm-cache");

  return env;
}
