import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runSetupCli, shouldRunCliMain } from "./cli.js";
import type {
  PackageContext,
  PackageInstallResult,
} from "./openclaw-bootstrap.js";
import type { SetupFlowResult } from "./setup-flow.js";

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
      rootDir: "/tmp/aitoearn-package",
      manifest: {
        name: "@aitoearn/openclaw-plugin",
        version: "1.2.3",
      },
    };
    loadPackageContext = vi.fn().mockResolvedValue(packageContext);
    installPlugin = vi
      .fn<(_: PackageContext) => Promise<PackageInstallResult>>()
      .mockResolvedValue({
        replacedExisting: false,
        targetDir: "/tmp/.openclaw/extensions/aitoearn",
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

  it("installs plugin files and writes OpenClaw config", async () => {
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
    expect(loadPackageContext).toHaveBeenCalledTimes(1);
    expect(installPlugin).toHaveBeenCalledWith(packageContext);
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
    expect(prompts.outro).toHaveBeenCalled();
  });

  it("returns success when setup is cancelled after installation", async () => {
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

  it("upgrades plugin files without rerunning setup", async () => {
    installPlugin.mockResolvedValue({
      replacedExisting: true,
      targetDir: "/tmp/.openclaw/extensions/aitoearn",
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
    expect(installPlugin).toHaveBeenCalledWith(packageContext);
    expect(runSetupFlow).not.toHaveBeenCalled();
    expect(writeConfig).not.toHaveBeenCalled();
    expect(prompts.outro).toHaveBeenCalledWith(
      'Upgrade complete! Run "openclaw gateway restart" to apply.'
    );
  });

  it("surfaces installation errors", async () => {
    installPlugin.mockRejectedValue(new Error("copy failed"));

    const exitCode = await runSetupCli([], {
      prompts,
      loadPackageContext,
      installPlugin,
      readConfig,
      writeConfig,
      runSetupFlow,
    });

    expect(exitCode).toBe(1);
    expect(prompts.cancel).toHaveBeenCalledWith("copy failed");
    expect(runSetupFlow).not.toHaveBeenCalled();
  });
});

describe("shouldRunCliMain", () => {
  it("matches the module path when invoked through a symlink", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "aitoearn-cli-test-"));
    const cliFilePath = path.join(tempDir, "cli.js");
    const linkPath = path.join(tempDir, "openclaw-plugin");

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
