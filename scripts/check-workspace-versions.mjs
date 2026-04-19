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

if (mismatches.length > 0) {
  const details = values.map((entry) => `${entry.label}: ${entry.version}`).join("\n");
  throw new Error(`Workspace version mismatch detected.\n${details}`);
}

console.log(`Workspace versions aligned at ${expectedVersion}`);
