import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applySetupConfigToOpenClawConfig,
  installPackageIntoOpenClaw,
  readOpenClawConfig,
  resolveOpenClawConfigPath,
  resolveOpenClawStateDir,
  writeOpenClawConfig,
  type PackageContext,
} from "./openclaw-bootstrap.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

describe("openclaw-bootstrap", () => {
  it("applies the plugin entry config", () => {
    expect(
      applySetupConfigToOpenClawConfig(
        {
          plugins: {
            entries: {
              existing: { enabled: true },
            },
          },
        },
        {
          apiKey: "test-api-key",
          baseUrl: "https://aitoearn.cn/api/",
        }
      )
    ).toEqual({
      plugins: {
        entries: {
          existing: { enabled: true },
          aitoearn: {
            enabled: true,
            config: {
              apiKey: "test-api-key",
              baseUrl: "https://aitoearn.cn/api",
            },
          },
        },
      },
    });
  });

  it("reads and writes OpenClaw config using JSON5", async () => {
    const homeDir = await mkTempDir();
    const env = {};
    const configPath = resolveOpenClawConfigPath(env, () => homeDir);

    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(
      configPath,
      `{
        // comment
        plugins: {
          entries: {
            existing: { enabled: true },
          },
        },
      }\n`,
      "utf8"
    );

    const config = await readOpenClawConfig(env, () => homeDir);
    expect(config).toEqual({
      plugins: {
        entries: {
          existing: { enabled: true },
        },
      },
    });

    await writeOpenClawConfig(
      {
        plugins: {
          entries: {
            aitoearn: { enabled: true },
          },
        },
      },
      env,
      () => homeDir
    );

    expect(JSON.parse(await readFile(configPath, "utf8"))).toEqual({
      plugins: {
        entries: {
          aitoearn: { enabled: true },
        },
      },
    });
  });

  it("installs published files and runtime dependencies", async () => {
    const packageRoot = await mkTempDir();
    const homeDir = await mkTempDir();
    const env = { OPENCLAW_STATE_DIR: path.join(homeDir, ".openclaw") };

    await mkdir(path.join(packageRoot, "dist"), { recursive: true });
    await writeFile(
      path.join(packageRoot, "package.json"),
      JSON.stringify(
        {
          name: "@aitoearn/openclaw-plugin",
          version: "1.2.3",
          files: ["dist", "openclaw.plugin.json", "skills"],
          dependencies: {
            depA: "1.0.0",
          },
        },
        null,
        2
      ),
      "utf8"
    );
    await writeFile(path.join(packageRoot, "dist", "index.js"), "export {};\n", "utf8");
    await writeFile(path.join(packageRoot, "openclaw.plugin.json"), "{}\n", "utf8");
    await mkdir(path.join(packageRoot, "skills", "aitoearn-earn"), {
      recursive: true,
    });
    await writeFile(
      path.join(packageRoot, "skills", "aitoearn-earn", "SKILL.md"),
      "---\nname: aitoearn-earn\ndescription: test\n---\n",
      "utf8"
    );
    await writeFile(path.join(packageRoot, "README.md"), "should not be copied\n", "utf8");

    await mkdir(path.join(packageRoot, "node_modules", "depA", "node_modules", "depB"), {
      recursive: true,
    });
    await writeFile(
      path.join(packageRoot, "node_modules", "depA", "package.json"),
      JSON.stringify(
        {
          name: "depA",
          version: "1.0.0",
          main: "index.js",
          dependencies: {
            depB: "1.0.0",
          },
        },
        null,
        2
      ),
      "utf8"
    );
    await writeFile(
      path.join(packageRoot, "node_modules", "depA", "index.js"),
      "module.exports = {};\n",
      "utf8"
    );
    await writeFile(
      path.join(packageRoot, "node_modules", "depA", "node_modules", "depB", "package.json"),
      JSON.stringify(
        {
          name: "depB",
          version: "1.0.0",
          main: "index.js",
        },
        null,
        2
      ),
      "utf8"
    );
    await writeFile(
      path.join(packageRoot, "node_modules", "depA", "node_modules", "depB", "index.js"),
      "module.exports = {};\n",
      "utf8"
    );

    const result = await installPackageIntoOpenClaw(
      {
        rootDir: packageRoot,
        manifest: {
          name: "@aitoearn/openclaw-plugin",
          version: "1.2.3",
          files: ["dist", "openclaw.plugin.json", "skills"],
          dependencies: {
            depA: "1.0.0",
          },
        },
      } satisfies PackageContext,
      env,
      () => homeDir
    );

    const installedRoot = result.targetDir;
    expect(result.replacedExisting).toBe(false);
    expect(resolveOpenClawStateDir(env, () => homeDir)).toBe(env.OPENCLAW_STATE_DIR);
    expect(await readFile(path.join(installedRoot, "dist", "index.js"), "utf8")).toContain(
      "export"
    );
    expect(
      await readFile(
        path.join(installedRoot, "skills", "aitoearn-earn", "SKILL.md"),
        "utf8"
      )
    ).toContain("aitoearn-earn");
    expect(
      await readFile(
        path.join(installedRoot, "node_modules", "depA", "index.js"),
        "utf8"
      )
    ).toContain("module.exports");
    expect(
      await readFile(
        path.join(
          installedRoot,
          "node_modules",
          "depA",
          "node_modules",
          "depB",
          "index.js"
        ),
        "utf8"
      )
    ).toContain("module.exports");
  });

  it("installs scoped dependencies without resolving their runtime entrypoint", async () => {
    const packageRoot = await mkTempDir();
    const homeDir = await mkTempDir();
    const env = { OPENCLAW_STATE_DIR: path.join(homeDir, ".openclaw") };

    await mkdir(path.join(packageRoot, "dist"), { recursive: true });
    await writeFile(
      path.join(packageRoot, "package.json"),
      JSON.stringify(
        {
          name: "@aitoearn/openclaw-plugin",
          version: "1.2.3",
          files: ["dist", "openclaw.plugin.json"],
          dependencies: {
            "@scope/dep-a": "1.0.0",
          },
        },
        null,
        2
      ),
      "utf8"
    );
    await writeFile(path.join(packageRoot, "dist", "index.js"), "export {};\n", "utf8");
    await writeFile(path.join(packageRoot, "openclaw.plugin.json"), "{}\n", "utf8");

    const scopedDependencyRoot = path.join(
      packageRoot,
      "node_modules",
      "@scope",
      "dep-a"
    );
    await mkdir(path.join(scopedDependencyRoot, "dist", "esm"), { recursive: true });
    await writeFile(
      path.join(scopedDependencyRoot, "package.json"),
      JSON.stringify(
        {
          name: "@scope/dep-a",
          version: "1.0.0",
          type: "module",
          exports: {
            ".": {
              import: "./dist/esm/index.js",
              require: "./dist/cjs/index.js",
            },
          },
        },
        null,
        2
      ),
      "utf8"
    );
    await writeFile(
      path.join(scopedDependencyRoot, "dist", "esm", "index.js"),
      "export const ok = true;\n",
      "utf8"
    );

    const result = await installPackageIntoOpenClaw(
      {
        rootDir: packageRoot,
        manifest: {
          name: "@aitoearn/openclaw-plugin",
          version: "1.2.3",
          files: ["dist", "openclaw.plugin.json"],
          dependencies: {
            "@scope/dep-a": "1.0.0",
          },
        },
      } satisfies PackageContext,
      env,
      () => homeDir
    );

    expect(
      await readFile(
        path.join(
          result.targetDir,
          "node_modules",
          "@scope",
          "dep-a",
          "dist",
          "esm",
          "index.js"
        ),
        "utf8"
      )
    ).toContain("ok = true");
  });
});

async function mkTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "aitoearn-openclaw-"));
  tempDirs.push(dir);
  return dir;
}
