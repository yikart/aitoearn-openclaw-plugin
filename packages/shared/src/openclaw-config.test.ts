import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applySetupConfigToOpenClawConfig,
  getPluginInstallRecord,
  hasConfiguredPluginEntry,
  readOpenClawConfig,
  resolveOpenClawConfigPath,
  resolveOpenClawStateDir,
  writeOpenClawConfig,
} from "./openclaw-config.js";

describe("openclaw-config helpers", () => {
  it("applies the plugin entry config without dropping existing entries", () => {
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

  it("reads and writes OpenClaw config using JSON5 input", async () => {
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
          installs: {
            aitoearn: {
              source: "npm",
            },
          },
        },
      },
      env,
      () => homeDir
    );

    expect(JSON.parse(await readFile(configPath, "utf8"))).toEqual({
      plugins: {
        installs: {
          aitoearn: {
            source: "npm",
          },
        },
      },
    });
  });

  it("resolves install records and configured plugin entries", () => {
    const config = {
      plugins: {
        installs: {
          aitoearn: {
            source: "npm",
            spec: "@aitoearn/openclaw-plugin@1.0.8",
          },
        },
        entries: {
          aitoearn: {
            enabled: true,
            config: {
              apiKey: {
                source: "env",
                provider: "default",
                id: "AITOEARN_API_KEY",
              },
              baseUrl: "https://aitoearn.ai/api",
            },
          },
        },
      },
    };

    expect(getPluginInstallRecord(config)).toEqual({
      source: "npm",
      spec: "@aitoearn/openclaw-plugin@1.0.8",
    });
    expect(hasConfiguredPluginEntry(config)).toBe(true);
  });

  it("prefers OPENCLAW_STATE_DIR when set", async () => {
    const homeDir = await mkTempDir();
    const env = {
      OPENCLAW_STATE_DIR: path.join(homeDir, ".custom-openclaw"),
    };

    expect(resolveOpenClawStateDir(env, () => homeDir)).toBe(
      env.OPENCLAW_STATE_DIR
    );
    expect(resolveOpenClawConfigPath(env, () => homeDir)).toBe(
      path.join(env.OPENCLAW_STATE_DIR, "openclaw.json")
    );
  });
});

async function mkTempDir(): Promise<string> {
  const tempRoot = path.join(
    process.env.TMPDIR ?? "/tmp",
    `aitoearn-openclaw-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  await mkdir(tempRoot, { recursive: true });
  return tempRoot;
}
