import { describe, expect, it } from "vitest";
import {
  buildBatchSetOperations,
  getPublishPlatformPolicy,
  getPublishToolPlatform,
  normalizeBaseUrl,
  resolveAiToEarnEnvironment,
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

  it("resolves AiToEarn environment from baseUrl", () => {
    expect(resolveAiToEarnEnvironment("https://aitoearn.cn/api")).toBe("china");
    expect(resolveAiToEarnEnvironment("https://dev.aitoearn.ai/api")).toBe(
      "global"
    );
    expect(resolveAiToEarnEnvironment("https://aitoearn.ai/api")).toBe(
      "global"
    );
    expect(resolveAiToEarnEnvironment("https://example.internal/api")).toBe(
      "self_hosted"
    );
  });

  it("returns publish platform policy by environment", () => {
    expect(getPublishPlatformPolicy("china")).toEqual([
      "douyin",
      "KWAI",
      "bilibili",
      "wxGzh",
    ]);
    expect(getPublishPlatformPolicy("global")).toEqual([
      "tiktok",
      "youtube",
      "twitter",
      "facebook",
      "instagram",
      "threads",
      "pinterest",
      "linkedin",
    ]);
    expect(getPublishPlatformPolicy("self_hosted")).toEqual([]);
  });

  it("maps publish tool names to platform ids", () => {
    expect(getPublishToolPlatform("publishPostToTiktok")).toBe("tiktok");
    expect(getPublishToolPlatform("publishPostToWxGzh")).toBe("wxGzh");
    expect(getPublishToolPlatform("publishPostToLinkedIn")).toBe("linkedin");
    expect(getPublishToolPlatform("getTaskDetail")).toBeNull();
  });
});
