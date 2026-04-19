import { describe, expect, it, vi } from "vitest";
import {
  installPluginWithOpenClaw,
  resolveInstallAction,
  resolveLegacyInstallDir,
  type PackageContext,
} from "./openclaw-install.js";

describe("resolveInstallAction", () => {
  it("installs when no install record or legacy install exists", async () => {
    await expect(
      resolveInstallAction(
        {},
        {
          legacyInstallDir: "/tmp/.openclaw/extensions/aitoearn",
          pathExists: vi.fn().mockResolvedValue(false),
        }
      )
    ).resolves.toBe("install");
  });

  it("migrates when no install record exists but legacy install dir is present", async () => {
    await expect(
      resolveInstallAction(
        {},
        {
          legacyInstallDir: "/tmp/.openclaw/extensions/aitoearn",
          pathExists: vi.fn().mockResolvedValue(true),
        }
      )
    ).resolves.toBe("migrate");
  });

  it("updates npm installs", async () => {
    await expect(
      resolveInstallAction(
        {
          plugins: {
            installs: {
              aitoearn: {
                source: "npm",
              },
            },
          },
        },
        {
          legacyInstallDir: "/tmp/.openclaw/extensions/aitoearn",
          pathExists: vi.fn(),
        }
      )
    ).resolves.toBe("update");
  });

  it("rejects non-npm installs", async () => {
    await expect(
      resolveInstallAction(
        {
          plugins: {
            installs: {
              aitoearn: {
                source: "path",
              },
            },
          },
        },
        {
          legacyInstallDir: "/tmp/.openclaw/extensions/aitoearn",
          pathExists: vi.fn(),
        }
      )
    ).rejects.toThrow('source "path"');
  });
});

describe("resolveLegacyInstallDir", () => {
  it("resolves the extensions directory under the OpenClaw state dir", () => {
    expect(
      resolveLegacyInstallDir(
        {
          OPENCLAW_STATE_DIR: "/tmp/custom-openclaw",
        },
        () => "/tmp/home"
      )
    ).toBe("/tmp/custom-openclaw/extensions/aitoearn");
  });
});

describe("installPluginWithOpenClaw", () => {
  const packageContext: PackageContext = {
    rootDir: "/tmp/installer",
    manifest: {
      name: "@aitoearn/openclaw-plugin-cli",
      version: "1.0.13",
    },
    runtimeInstallSpec: "@aitoearn/openclaw-plugin@1.0.13",
    runtimeTrackSpec: "@aitoearn/openclaw-plugin",
  };

  it("calls openclaw plugins install for a fresh install", async () => {
    const runOpenClaw = vi.fn().mockResolvedValue(undefined);
    const readConfig = vi.fn().mockResolvedValue({
      plugins: {
        installs: {
          aitoearn: {
            source: "npm",
            spec: "@aitoearn/openclaw-plugin@1.0.13",
            resolvedSpec: "@aitoearn/openclaw-plugin@1.0.13",
          },
        },
      },
    });
    const writeConfig = vi.fn().mockResolvedValue("/tmp/.openclaw/openclaw.json");

    const result = await installPluginWithOpenClaw(
      {
        command: "auto",
        currentConfig: {},
        packageContext,
      },
      {
        runOpenClaw,
        env: {
          OPENCLAW_STATE_DIR: "/tmp/.openclaw",
        },
        pathExists: vi.fn().mockResolvedValue(false),
        readConfig,
        writeConfig,
      }
    );

    expect(result).toEqual({ action: "install" });
    expect(runOpenClaw).toHaveBeenCalledWith(
      ["plugins", "install", "@aitoearn/openclaw-plugin@1.0.13"],
      {
        env: expect.objectContaining({
          OPENCLAW_STATE_DIR: "/tmp/.openclaw",
          npm_config_registry: "https://registry.npmjs.org/",
          NPM_CONFIG_REGISTRY: "https://registry.npmjs.org/",
        }),
      }
    );
    expect(writeConfig).toHaveBeenCalledWith(
      {
        plugins: {
          installs: {
            aitoearn: {
              source: "npm",
              spec: "@aitoearn/openclaw-plugin",
              resolvedSpec: "@aitoearn/openclaw-plugin@1.0.13",
            },
          },
        },
      },
      {
        OPENCLAW_STATE_DIR: "/tmp/.openclaw",
      },
      expect.any(Function)
    );
  });

  it("calls openclaw plugins update for npm installs", async () => {
    const runOpenClaw = vi.fn().mockResolvedValue(undefined);
    const writeConfig = vi.fn();

    const result = await installPluginWithOpenClaw(
      {
        command: "upgrade",
        currentConfig: {
          plugins: {
            installs: {
              aitoearn: {
                source: "npm",
              },
            },
          },
        },
        packageContext,
      },
      {
        runOpenClaw,
        env: {
          OPENCLAW_STATE_DIR: "/tmp/.openclaw",
        },
        pathExists: vi.fn(),
        writeConfig,
      }
    );

    expect(result).toEqual({ action: "update" });
    expect(runOpenClaw).toHaveBeenCalledWith(
      ["plugins", "update", "aitoearn"],
      {
        env: expect.objectContaining({
          OPENCLAW_STATE_DIR: "/tmp/.openclaw",
          npm_config_registry: "https://registry.npmjs.org/",
          NPM_CONFIG_REGISTRY: "https://registry.npmjs.org/",
        }),
      }
    );
    expect(writeConfig).not.toHaveBeenCalled();
  });

  it("migrates legacy installs by renaming the old directory before install", async () => {
    const runOpenClaw = vi.fn().mockResolvedValue(undefined);
    const readConfig = vi.fn().mockResolvedValue({
      plugins: {
        installs: {
          aitoearn: {
            source: "npm",
            spec: "@aitoearn/openclaw-plugin@1.0.13",
            resolvedSpec: "@aitoearn/openclaw-plugin@1.0.13",
          },
        },
      },
    });
    const rename = vi.fn().mockResolvedValue(undefined);
    const rm = vi.fn().mockResolvedValue(undefined);
    const writeConfig = vi.fn().mockResolvedValue("/tmp/.openclaw/openclaw.json");

    const result = await installPluginWithOpenClaw(
      {
        command: "upgrade",
        currentConfig: {},
        packageContext,
      },
      {
        runOpenClaw,
        env: {
          OPENCLAW_STATE_DIR: "/tmp/.openclaw",
        },
        pathExists: vi.fn().mockResolvedValue(true),
        readConfig,
        rename,
        rm,
        now: () => 12345,
        pid: 4321,
        writeConfig,
      }
    );

    expect(result).toEqual({ action: "migrate" });
    expect(rename).toHaveBeenNthCalledWith(
      1,
      "/tmp/.openclaw/extensions/aitoearn",
      "/tmp/.openclaw/extensions/aitoearn.legacy-backup-4321-12345"
    );
    expect(runOpenClaw).toHaveBeenCalledWith(
      ["plugins", "install", "@aitoearn/openclaw-plugin@1.0.13"],
      {
        env: expect.objectContaining({
          OPENCLAW_STATE_DIR: "/tmp/.openclaw",
          npm_config_registry: "https://registry.npmjs.org/",
          NPM_CONFIG_REGISTRY: "https://registry.npmjs.org/",
        }),
      }
    );
    expect(rm).toHaveBeenCalledWith(
      "/tmp/.openclaw/extensions/aitoearn.legacy-backup-4321-12345",
      { recursive: true, force: true }
    );
    expect(writeConfig).toHaveBeenCalledWith(
      {
        plugins: {
          installs: {
            aitoearn: {
              source: "npm",
              spec: "@aitoearn/openclaw-plugin",
              resolvedSpec: "@aitoearn/openclaw-plugin@1.0.13",
            },
          },
        },
      },
      {
        OPENCLAW_STATE_DIR: "/tmp/.openclaw",
      },
      expect.any(Function)
    );
  });

  it("restores the legacy install if migration install fails", async () => {
    const runOpenClaw = vi.fn().mockRejectedValue(new Error("plugin already exists"));
    const rename = vi.fn().mockResolvedValue(undefined);
    const rm = vi.fn().mockResolvedValue(undefined);

    await expect(
      installPluginWithOpenClaw(
        {
          command: "upgrade",
          currentConfig: {},
          packageContext,
        },
        {
          runOpenClaw,
          env: {
            OPENCLAW_STATE_DIR: "/tmp/.openclaw",
          },
          pathExists: vi
            .fn()
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(false),
          rename,
          rm,
          now: () => 12345,
          pid: 4321,
        }
      )
    ).rejects.toThrow("plugin already exists");

    expect(rename).toHaveBeenNthCalledWith(
      1,
      "/tmp/.openclaw/extensions/aitoearn",
      "/tmp/.openclaw/extensions/aitoearn.legacy-backup-4321-12345"
    );
    expect(rename).toHaveBeenNthCalledWith(
      2,
      "/tmp/.openclaw/extensions/aitoearn.legacy-backup-4321-12345",
      "/tmp/.openclaw/extensions/aitoearn"
    );
    expect(rm).not.toHaveBeenCalled();
  });

  it("retries with the next registry when install fails once", async () => {
    const runOpenClaw = vi
      .fn()
      .mockRejectedValueOnce(new Error("first registry failed"))
      .mockResolvedValueOnce(undefined);

    const result = await installPluginWithOpenClaw(
      {
        command: "auto",
        currentConfig: {},
        packageContext,
      },
      {
        runOpenClaw,
        env: {
          OPENCLAW_STATE_DIR: "/tmp/.openclaw",
        },
        pathExists: vi.fn().mockResolvedValue(false),
        registries: ["https://registry.npmjs.org/", "http://mirrors.cloud.tencent.com/npm/"],
        readConfig: vi.fn().mockResolvedValue({
          plugins: {
            installs: {
              aitoearn: {
                source: "npm",
                spec: "@aitoearn/openclaw-plugin@1.0.13",
                resolvedSpec: "@aitoearn/openclaw-plugin@1.0.13",
              },
            },
          },
        }),
        writeConfig: vi.fn().mockResolvedValue("/tmp/.openclaw/openclaw.json"),
      }
    );

    expect(result).toEqual({ action: "install" });
    expect(runOpenClaw).toHaveBeenNthCalledWith(
      1,
      ["plugins", "install", "@aitoearn/openclaw-plugin@1.0.13"],
      {
        env: expect.objectContaining({
          npm_config_registry: "https://registry.npmjs.org/",
          NPM_CONFIG_REGISTRY: "https://registry.npmjs.org/",
        }),
      }
    );
    expect(runOpenClaw).toHaveBeenNthCalledWith(
      2,
      ["plugins", "install", "@aitoearn/openclaw-plugin@1.0.13"],
      {
        env: expect.objectContaining({
          npm_config_registry: "http://mirrors.cloud.tencent.com/npm/",
          NPM_CONFIG_REGISTRY: "http://mirrors.cloud.tencent.com/npm/",
        }),
      }
    );
  });

  it("stops retrying when the host openclaw command is missing", async () => {
    const missingCommandError = Object.assign(new Error("missing command"), {
      code: "OPENCLAW_COMMAND_NOT_FOUND",
    });
    const runOpenClaw = vi.fn().mockRejectedValue(missingCommandError);

    await expect(
      installPluginWithOpenClaw(
        {
          command: "auto",
          currentConfig: {},
          packageContext,
        },
        {
          runOpenClaw,
          pathExists: vi.fn().mockResolvedValue(false),
          registries: ["https://registry.npmjs.org/", "http://mirrors.cloud.tencent.com/npm/"],
        }
      )
    ).rejects.toThrow("missing command");

    expect(runOpenClaw).toHaveBeenCalledTimes(1);
  });
});
