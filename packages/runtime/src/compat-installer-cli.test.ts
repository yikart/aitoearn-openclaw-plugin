import { describe, expect, it, vi } from "vitest";

import { runCompatInstallerCli } from "./compat-installer-cli.js";

describe("runCompatInstallerCli", () => {
  it("warns and delegates to the installer package", async () => {
    const warn = vi.fn();
    const runSetupCli = vi.fn().mockResolvedValue(0);

    const exitCode = await runCompatInstallerCli(["upgrade"], {
      runSetupCli,
      warn,
    });

    expect(exitCode).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      "Deprecated compatibility entrypoint detected. Forwarding to @aitoearn/openclaw-plugin-cli."
    );
    expect(runSetupCli).toHaveBeenCalledWith(["upgrade"]);
  });
});
