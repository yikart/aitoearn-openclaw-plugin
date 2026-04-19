import { readFileSync } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

const targets = [
  {
    label: "root package.json",
    path: "package.json",
    field: "version",
  },
  {
    label: "packages/shared/package.json",
    path: "packages/shared/package.json",
    field: "version",
  },
  {
    label: "packages/runtime/package.json",
    path: "packages/runtime/package.json",
    field: "version",
  },
  {
    label: "packages/runtime/openclaw.plugin.json",
    path: "packages/runtime/openclaw.plugin.json",
    field: "version",
  },
  {
    label: "packages/installer/package.json",
    path: "packages/installer/package.json",
    field: "version",
  },
];

const values = targets.map((target) => {
  const absolutePath = path.join(rootDir, target.path);
  const raw = readFileSync(absolutePath, "utf8");
  const parsed = JSON.parse(raw);
  const version = parsed[target.field];

  if (typeof version !== "string" || version.trim().length === 0) {
    throw new Error(`${target.label} is missing a valid ${target.field}`);
  }

  return {
    ...target,
    version: version.trim(),
  };
});

const expectedVersion = values[0]?.version;
const mismatches = values.filter((entry) => entry.version !== expectedVersion);

const runtimeManifest = JSON.parse(
  readFileSync(path.join(rootDir, "packages/runtime/package.json"), "utf8")
);
const installerDependencyVersion =
  runtimeManifest.dependencies?.["@aitoearn/aitoearn-openclaw-cli"];

if (!satisfiesSupportedRange(expectedVersion, installerDependencyVersion)) {
  const details = values
    .map((entry) => `${entry.label}: ${entry.version}`)
    .concat(
      `packages/runtime/package.json dependency @aitoearn/aitoearn-openclaw-cli: ${
        installerDependencyVersion ?? "(missing)"
      }`
    )
    .join("\n");
  throw new Error(`Workspace version mismatch detected.\n${details}`);
}

if (mismatches.length > 0) {
  const details = values
    .map((entry) => `${entry.label}: ${entry.version}`)
    .concat(
      `packages/runtime/package.json dependency @aitoearn/aitoearn-openclaw-cli: ${
        installerDependencyVersion ?? "(missing)"
      }`
    )
    .join("\n");
  throw new Error(`Workspace version mismatch detected.\n${details}`);
}

console.log(`Workspace versions aligned at ${expectedVersion}`);

function satisfiesSupportedRange(version, range) {
  if (typeof version !== "string" || typeof range !== "string") {
    return false;
  }

  const normalizedVersion = version.trim();
  const normalizedRange = range.trim();
  if (!normalizedVersion || !normalizedRange) {
    return false;
  }

  if (normalizedRange === normalizedVersion) {
    return true;
  }

  if (!normalizedRange.startsWith("^")) {
    return false;
  }

  const base = parseSemver(normalizedRange.slice(1));
  const current = parseSemver(normalizedVersion);
  if (!base || !current) {
    return false;
  }

  if (base.major > 0) {
    return current.major === base.major && compareSemver(current, base) >= 0;
  }

  if (base.minor > 0) {
    return (
      current.major === 0 &&
      current.minor === base.minor &&
      compareSemver(current, base) >= 0
    );
  }

  return (
    current.major === 0 &&
    current.minor === 0 &&
    current.patch === base.patch &&
    compareSemver(current, base) >= 0
  );
}

function parseSemver(value) {
  const match = value.match(
    /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
  );
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareSemver(left, right) {
  if (left.major !== right.major) {
    return left.major - right.major;
  }

  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }

  return left.patch - right.patch;
}
