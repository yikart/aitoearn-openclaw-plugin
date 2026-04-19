import { describe, expect, it, vi } from "vitest";
import { runSetupCliMain } from "./bin.js";

describe("runSetupCliMain", () => {
  it("forwards args and keeps the exit code", async () => {
    const runCli = vi.fn().mockResolvedValue(1);
    const originalExitCode = process.exitCode;
    process.exitCode = undefined;

    try {
      const exitCode = await runSetupCliMain(["upgrade"], runCli);

      expect(exitCode).toBe(1);
      expect(process.exitCode).toBe(1);
      expect(runCli).toHaveBeenCalledWith(["upgrade"]);
    } finally {
      process.exitCode = originalExitCode;
    }
  });
});
