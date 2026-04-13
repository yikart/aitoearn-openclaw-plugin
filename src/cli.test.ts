import { beforeEach, describe, expect, it, vi } from "vitest";
import { runSetupCli, type CommandResult } from "./cli.js";
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
  let runCommand: ReturnType<typeof vi.fn>;
  let loadPackageVersion: ReturnType<typeof vi.fn>;
  let runSetupFlow: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    prompts = createPromptApi();
    runCommand = vi.fn<(_: string, __: string[]) => Promise<CommandResult>>();
    loadPackageVersion = vi.fn().mockResolvedValue("1.2.3");
    runSetupFlow = vi.fn<() => Promise<SetupFlowResult>>();
  });

  it("fails fast when OpenClaw CLI is unavailable", async () => {
    runCommand.mockResolvedValueOnce({
      code: 1,
      stdout: "",
      stderr: "spawn openclaw ENOENT",
    });

    const exitCode = await runSetupCli([], {
      prompts,
      runCommand,
      loadPackageVersion,
      runSetupFlow,
    });

    expect(exitCode).toBe(1);
    expect(prompts.cancel).toHaveBeenCalled();
    expect(runSetupFlow).not.toHaveBeenCalled();
  });

  it("installs the plugin when missing and writes OpenClaw config", async () => {
    runCommand
      .mockResolvedValueOnce({ code: 0, stdout: "2026.3.28", stderr: "" })
      .mockResolvedValueOnce({ code: 1, stdout: "", stderr: "plugin not found" })
      .mockResolvedValueOnce({ code: 0, stdout: "installed", stderr: "" })
      .mockResolvedValueOnce({ code: 0, stdout: "updated", stderr: "" });
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
      runCommand,
      loadPackageVersion,
      runSetupFlow,
    });

    expect(exitCode).toBe(0);
    expect(runCommand).toHaveBeenNthCalledWith(1, "openclaw", ["--version"]);
    expect(runCommand).toHaveBeenNthCalledWith(2, "openclaw", [
      "plugins",
      "inspect",
      "aitoearn",
      "--json",
    ]);
    expect(runCommand).toHaveBeenNthCalledWith(3, "openclaw", [
      "plugins",
      "install",
      "@aitoearn/openclaw-plugin@1.2.3",
    ]);

    const configCall = runCommand.mock.calls[3];
    expect(configCall?.[0]).toBe("openclaw");
    expect(configCall?.[1]?.slice(0, 3)).toEqual([
      "config",
      "set",
      "--batch-json",
    ]);

    const batchPayload = JSON.parse(configCall?.[1]?.[3] ?? "[]") as Array<{
      path: string;
      value: unknown;
    }>;
    expect(batchPayload).toEqual([
      { path: "plugins.entries.aitoearn.enabled", value: true },
      {
        path: "plugins.entries.aitoearn.config.apiKey",
        value: "test-api-key",
      },
      {
        path: "plugins.entries.aitoearn.config.baseUrl",
        value: "https://aitoearn.ai/api",
      },
    ]);
    expect(prompts.outro).toHaveBeenCalled();
  });

  it("skips install when the plugin is already installed", async () => {
    runCommand
      .mockResolvedValueOnce({ code: 0, stdout: "2026.3.28", stderr: "" })
      .mockResolvedValueOnce({ code: 0, stdout: "{}", stderr: "" });
    runSetupFlow.mockResolvedValue({ status: "cancelled" });

    const exitCode = await runSetupCli([], {
      prompts,
      runCommand,
      loadPackageVersion,
      runSetupFlow,
    });

    expect(exitCode).toBe(0);
    expect(runCommand).toHaveBeenCalledTimes(2);
  });
});
