import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SetupFlowResult } from "../../shared/src/setup-flow.js";
import {
  runSetupCli,
  shouldRunCliMain,
} from "./cli.js";
import type {
  InstallPluginResult,
  PackageContext,
} from "./openclaw-install.js";

function createPromptApi() {
  return {
    intro: vi.fn(),
    cancel: vi.fn(),
    outro: vi.fn(),
    spinner: vi.fn(() => ({
      start: vi.fn(),
      stop: vi.fn(),
    })),
  };
}

describe("runSetupCli", () => {
  let prompts: ReturnType<typeof createPromptApi>;
  let loadPackageContext: ReturnType<typeof vi.fn>;
  let installPlugin: ReturnType<typeof vi.fn>;
  let readConfig: ReturnType<typeof vi.fn>;
  let writeConfig: ReturnType<typeof vi.fn>;
  let runSetupFlow: ReturnType<typeof vi.fn>;
  let packageContext: PackageContext;

  beforeEach(() => {
    prompts = createPromptApi();
    packageContext = {
      rootDir: "/tmp/aitoearn-installer",
      manifest: {
        name: "@aitoearn/aitoearn-openclaw-cli",
        version: "1.2.3",
      },
      openclawCliPath: "/tmp/node_modules/openclaw/openclaw.mjs",
      runtimeInstallSpec: "@aitoearn/openclaw-plugin@1.2.3",
      runtimeTrackSpec: "@aitoearn/openclaw-plugin",
    };
    loadPackageContext = vi.fn().mockResolvedValue(packageContext);
    installPlugin = vi
      .fn<
        (_: {
          command: "auto" | "install" | "upgrade";
          currentConfig: Record<string, unknown>;
          packageContext: PackageContext;
        }) => Promise<InstallPluginResult>
      >()
      .mockResolvedValue({
        action: "install",
      });
    readConfig = vi.fn().mockResolvedValue({
      plugins: {
        entries: {
          existing: { enabled: true },
        },
      },
    });
    writeConfig = vi.fn().mockResolvedValue("/tmp/.openclaw/openclaw.json");
    runSetupFlow = vi.fn<() => Promise<SetupFlowResult>>();
  });

  it("shows help for --help", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const exitCode = await runSetupCli(["--help"], {
      prompts,
      loadPackageContext,
      installPlugin,
      readConfig,
      writeConfig,
      runSetupFlow,
    });

    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalled();
    expect(loadPackageContext).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });

  it("installs plugin and writes OpenClaw config", async () => {
    runSetupFlow.mockResolvedValue({
      status: "completed",
      config: {
        apiKey: "test-api-key",
        baseUrl: "https://aitoearn.ai/api/",
      },
      toolCount: 3,
    });

    const exitCode = await runSetupCli([], {
      prompts,
      loadPackageContext,
      installPlugin,
      readConfig,
      writeConfig,
      runSetupFlow,
    });

    expect(exitCode).toBe(0);
    expect(installPlugin).toHaveBeenCalledWith({
      command: "auto",
      currentConfig: {
        plugins: {
          entries: {
            existing: { enabled: true },
          },
        },
      },
      packageContext,
    });
    expect(writeConfig).toHaveBeenCalledWith({
      plugins: {
        entries: {
          existing: { enabled: true },
          aitoearn: {
            enabled: true,
            config: {
              apiKey: "test-api-key",
              baseUrl: "https://aitoearn.ai/api",
            },
          },
        },
      },
    });
    expect(prompts.outro).toHaveBeenCalledWith(
      'Configuration saved! Run "openclaw gateway restart" to apply.'
    );
  });

  it("auto-skips setup when valid configuration already exists", async () => {
    installPlugin.mockResolvedValue({
      action: "update",
    });
    readConfig.mockResolvedValue({
      plugins: {
        entries: {
          aitoearn: {
            enabled: true,
            config: {
              apiKey: "existing-api-key",
              baseUrl: "https://aitoearn.ai/api",
            },
          },
        },
      },
    });

    const exitCode = await runSetupCli([], {
      prompts,
      loadPackageContext,
      installPlugin,
      readConfig,
      writeConfig,
      runSetupFlow,
    });

    expect(exitCode).toBe(0);
    expect(runSetupFlow).not.toHaveBeenCalled();
    expect(writeConfig).not.toHaveBeenCalled();
    expect(prompts.outro).toHaveBeenCalledWith(
      'Existing configuration detected. Upgrade complete! Run "openclaw gateway restart" to apply.'
    );
  });

  it("returns success when setup is cancelled after install", async () => {
    runSetupFlow.mockResolvedValue({ status: "cancelled" });

    const exitCode = await runSetupCli([], {
      prompts,
      loadPackageContext,
      installPlugin,
      readConfig,
      writeConfig,
      runSetupFlow,
    });

    expect(exitCode).toBe(0);
    expect(writeConfig).not.toHaveBeenCalled();
  });

  it("continues into setup when existing config is incomplete", async () => {
    installPlugin.mockResolvedValue({
      action: "update",
    });
    readConfig
      .mockResolvedValueOnce({
        plugins: {
          entries: {
            aitoearn: {
              enabled: true,
              config: {},
            },
          },
        },
      })
      .mockResolvedValueOnce({
        plugins: {
          installs: {
            aitoearn: {
              source: "npm",
            },
          },
          entries: {
            aitoearn: {
              enabled: true,
              config: {},
            },
          },
        },
      });
    runSetupFlow.mockResolvedValue({
      status: "completed",
      config: {
        apiKey: "new-api-key",
        baseUrl: "https://aitoearn.ai/api/",
      },
      toolCount: 3,
    });

    const exitCode = await runSetupCli([], {
      prompts,
      loadPackageContext,
      installPlugin,
      readConfig,
      writeConfig,
      runSetupFlow,
    });

    expect(exitCode).toBe(0);
    expect(readConfig).toHaveBeenCalledTimes(2);
    expect(writeConfig).toHaveBeenCalledWith({
      plugins: {
        installs: {
          aitoearn: {
            source: "npm",
          },
        },
        entries: {
          aitoearn: {
            enabled: true,
            config: {
              apiKey: "new-api-key",
              baseUrl: "https://aitoearn.ai/api",
            },
          },
        },
      },
    });
  });

  it("uses OpenClaw upgrade flow without rerunning setup", async () => {
    installPlugin.mockResolvedValue({
      action: "update",
    });
    readConfig.mockResolvedValue({
      plugins: {
        installs: {
          aitoearn: {
            source: "npm",
          },
        },
      },
    });

    const exitCode = await runSetupCli(["upgrade"], {
      prompts,
      loadPackageContext,
      installPlugin,
      readConfig,
      writeConfig,
      runSetupFlow,
    });

    expect(exitCode).toBe(0);
    expect(installPlugin).toHaveBeenCalledWith({
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
    });
    expect(runSetupFlow).not.toHaveBeenCalled();
    expect(writeConfig).not.toHaveBeenCalled();
    expect(prompts.outro).toHaveBeenCalledWith(
      'Upgrade complete! Run "openclaw gateway restart" to apply.'
    );
  });

  it("surfaces installation errors", async () => {
    installPlugin.mockRejectedValue(new Error("install failed"));

    const exitCode = await runSetupCli([], {
      prompts,
      loadPackageContext,
      installPlugin,
      readConfig,
      writeConfig,
      runSetupFlow,
    });

    expect(exitCode).toBe(1);
    expect(prompts.cancel).toHaveBeenCalledWith("install failed");
    expect(runSetupFlow).not.toHaveBeenCalled();
  });
});

describe("shouldRunCliMain", () => {
  it("matches the module path when invoked through a symlink", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "aitoearn-cli-test-"));
    const cliFilePath = path.join(tempDir, "cli.js");
    const linkPath = path.join(tempDir, "aitoearn-openclaw");

    try {
      await writeFile(cliFilePath, "#!/usr/bin/env node\n", "utf8");
      await symlink(cliFilePath, linkPath);

      expect(
        shouldRunCliMain(linkPath, new URL(`file://${cliFilePath}`).href)
      ).toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("returns false for a different entry path", () => {
    expect(
      shouldRunCliMain("/tmp/other-cli.js", new URL("file:///tmp/cli.js").href)
    ).toBe(false);
  });
});
