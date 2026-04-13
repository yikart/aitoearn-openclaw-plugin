import { describe, expect, it } from "vitest";
import {
  buildBatchSetOperations,
  normalizeBaseUrl,
} from "./plugin-config.js";

describe("plugin-config helpers", () => {
  it("normalizes trailing slashes and falls back to the default base URL", () => {
    expect(normalizeBaseUrl("https://aitoearn.ai/api/")).toBe(
      "https://aitoearn.ai/api"
    );
    expect(normalizeBaseUrl("   ")).toBe("https://aitoearn.ai/api");
    expect(normalizeBaseUrl()).toBe("https://aitoearn.ai/api");
  });

  it("builds batch config operations for OpenClaw", () => {
    expect(
      buildBatchSetOperations({
        apiKey: "test-api-key",
        baseUrl: "https://aitoearn.cn/api/",
      })
    ).toEqual([
      { path: "plugins.entries.aitoearn.enabled", value: true },
      {
        path: "plugins.entries.aitoearn.config.apiKey",
        value: "test-api-key",
      },
      {
        path: "plugins.entries.aitoearn.config.baseUrl",
        value: "https://aitoearn.cn/api",
      },
    ]);
  });
});
