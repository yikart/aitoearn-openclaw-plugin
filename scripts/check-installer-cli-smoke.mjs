import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, statSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = path.join(rootDir, ".tmp");
const npmEnv = createNestedNpmEnv();

mkdirSync(tempRoot, { recursive: true });

runNpm(["run", "build", "--workspace", "@aitoearn/openclaw-plugin-cli"]);

const packOutput = runNpm([
  "pack",
  "--json",
  "--workspace",
  "@aitoearn/openclaw-plugin-cli",
]);
const packEntries = JSON.parse(packOutput);
const tarballName =
  Array.isArray(packEntries) && typeof packEntries[0]?.filename === "string"
    ? packEntries[0].filename
    : undefined;

if (!tarballName) {
  throw new Error("npm pack did not produce an installer tarball name.");
}

const tarballPath = path.join(rootDir, tarballName);
const tempDir = path.join(
  tempRoot,
  `installer-cli-smoke-${process.pid}-${Date.now()}`
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

  const expectedBinTarget = "dist/installer/src/index.js";
  const actualBinTarget = packedManifest.bin?.["openclaw-plugin-cli"];

  if (actualBinTarget !== expectedBinTarget) {
    throw new Error(
      `Packed installer bin target mismatch: expected "${expectedBinTarget}", received "${actualBinTarget ?? "undefined"}".`
    );
  }

  const entryPath = path.join(packageDir, expectedBinTarget);
  const mode = statSync(entryPath).mode & 0o777;

  if ((mode & 0o111) === 0) {
    throw new Error(
      `Packed installer entry is not executable: mode=${mode.toString(8)} path=${entryPath}`
    );
  }

  const binDir = path.join(tempDir, "bin");
  const binPath = path.join(binDir, "openclaw-plugin-cli");

  mkdirSync(binDir, { recursive: true });
  symlinkSync(entryPath, binPath);

  const result = spawnSync(binPath, ["--help"], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `Packed installer bin exited with status ${result.status}.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }

  const combinedOutput = `${result.stdout}\n${result.stderr}`;
  if (
    !combinedOutput.includes("Usage:") ||
    !combinedOutput.includes("openclaw-plugin-cli")
  ) {
    throw new Error(
      `Packed installer bin did not print help output.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }

  console.log("Installer CLI smoke passed.");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
  rmSync(tarballPath, { force: true });
}

function runNpm(args) {
  return execFileSync("npm", args, {
    cwd: rootDir,
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
