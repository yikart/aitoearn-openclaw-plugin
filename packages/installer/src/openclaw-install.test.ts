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
      version: "1.0.10",
    },
    openclawCliPath: "/tmp/node_modules/openclaw/openclaw.mjs",
    runtimeInstallSpec: "@aitoearn/openclaw-plugin@1.0.10",
    runtimeTrackSpec: "@aitoearn/openclaw-plugin",
  };

  it("calls openclaw plugins install for a fresh install", async () => {
    const runOpenClaw = vi.fn().mockResolvedValue(undefined);
    const readConfig = vi.fn().mockResolvedValue({
      plugins: {
        installs: {
          aitoearn: {
            source: "npm",
            spec: "@aitoearn/openclaw-plugin@1.0.10",
            resolvedSpec: "@aitoearn/openclaw-plugin@1.0.10",
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
    expect(runOpenClaw).toHaveBeenCalledWith(packageContext.openclawCliPath, [
      "plugins",
      "install",
      "@aitoearn/openclaw-plugin@1.0.10",
    ]);
    expect(writeConfig).toHaveBeenCalledWith(
      {
        plugins: {
          installs: {
            aitoearn: {
              source: "npm",
              spec: "@aitoearn/openclaw-plugin",
              resolvedSpec: "@aitoearn/openclaw-plugin@1.0.10",
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
    expect(runOpenClaw).toHaveBeenCalledWith(packageContext.openclawCliPath, [
      "plugins",
      "update",
      "aitoearn",
    ]);
    expect(writeConfig).not.toHaveBeenCalled();
  });

  it("migrates legacy installs by renaming the old directory before install", async () => {
    const runOpenClaw = vi.fn().mockResolvedValue(undefined);
    const readConfig = vi.fn().mockResolvedValue({
      plugins: {
        installs: {
          aitoearn: {
            source: "npm",
            spec: "@aitoearn/openclaw-plugin@1.0.10",
            resolvedSpec: "@aitoearn/openclaw-plugin@1.0.10",
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
    expect(runOpenClaw).toHaveBeenCalledWith(packageContext.openclawCliPath, [
      "plugins",
      "install",
      "@aitoearn/openclaw-plugin@1.0.10",
    ]);
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
              resolvedSpec: "@aitoearn/openclaw-plugin@1.0.10",
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
});
