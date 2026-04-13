import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applySyncToolDiscoveryLogs,
  loadToolDefinitionsSync,
  resolveToolSnapshotPath,
} from "./tool-discovery.js";

describe("loadToolDefinitionsSync", () => {
  const execFileSync = vi.fn();
  const mkdirSync = vi.fn();
  const readFileSync = vi.fn();
  const renameSync = vi.fn();
  const writeFileSync = vi.fn();

  beforeEach(() => {
    execFileSync.mockReset();
    mkdirSync.mockReset();
    readFileSync.mockReset();
    renameSync.mockReset();
    writeFileSync.mockReset();
  });

  it("uses remote tools and writes a snapshot when helper succeeds", () => {
    execFileSync.mockReturnValue(
      JSON.stringify({
        status: "ok",
        tools: [
          {
            name: "remote_tool",
            description: "Remote",
            inputSchema: { type: "object", properties: {} },
          },
        ],
        invalidCount: 0,
        duplicateCount: 0,
      })
    );

    const result = loadToolDefinitionsSync({
      config: {},
      pluginConfig: {
        apiKey: "test-api-key",
        baseUrl: "https://aitoearn.ai/api",
      },
      stateDir: "/tmp/openclaw-state",
      deps: {
        execFileSync,
        fs: {
          mkdirSync,
          readFileSync,
          renameSync,
          writeFileSync,
        },
        helperPath: "/tmp/helper.js",
        now: () => 12345,
        pid: 4321,
      },
    });

    expect(result.source).toBe("remote");
    expect(result.tools).toEqual([
      {
        name: "remote_tool",
        description: "Remote",
        inputSchema: { type: "object", properties: {} },
      },
    ]);
    expect(execFileSync).toHaveBeenCalledWith(
      process.execPath,
      ["/tmp/helper.js"],
      expect.objectContaining({
        timeout: 5000,
      })
    );
    expect(writeFileSync).toHaveBeenCalledWith(
      "/tmp/openclaw-state/cache/aitoearn-tools.json.4321.12345.tmp",
      expect.stringContaining('"remote_tool"'),
      "utf8"
    );
    expect(renameSync).toHaveBeenCalledWith(
      "/tmp/openclaw-state/cache/aitoearn-tools.json.4321.12345.tmp",
      "/tmp/openclaw-state/cache/aitoearn-tools.json"
    );
  });

  it("falls back to cached snapshot when helper returns sync_error", () => {
    execFileSync.mockReturnValue(
      JSON.stringify({
        status: "sync_error",
        message: "network timeout",
      })
    );
    readFileSync.mockReturnValue(
      JSON.stringify({
        version: 1,
        syncedAt: "2026-04-13T00:00:00.000Z",
        tools: [
          {
            name: "cached_tool",
            description: "Cached",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      })
    );

    const result = loadToolDefinitionsSync({
      config: {},
      pluginConfig: {
        apiKey: "test-api-key",
        baseUrl: "https://aitoearn.ai/api",
      },
      stateDir: "/tmp/openclaw-state",
      deps: {
        execFileSync,
        fs: {
          mkdirSync,
          readFileSync,
          renameSync,
          writeFileSync,
        },
      },
    });

    expect(result.source).toBe("snapshot");
    expect(result.tools).toEqual([
      {
        name: "cached_tool",
        description: "Cached",
        inputSchema: { type: "object", properties: {} },
      },
    ]);
    expect(result.logs[0]?.message).toContain("using cached snapshot");
  });

  it("does not fall back when helper reports a config error", () => {
    execFileSync.mockReturnValue(
      JSON.stringify({
        status: "config_error",
        message: "Missing AITOEARN_API_KEY",
      })
    );

    const result = loadToolDefinitionsSync({
      config: {},
      pluginConfig: {
        apiKey: "test-api-key",
        baseUrl: "https://aitoearn.ai/api",
      },
      stateDir: "/tmp/openclaw-state",
      deps: {
        execFileSync,
        fs: {
          mkdirSync,
          readFileSync,
          renameSync,
          writeFileSync,
        },
      },
    });

    expect(result.source).toBe("none");
    expect(result.tools).toEqual([]);
    expect(readFileSync).not.toHaveBeenCalled();
  });
});

describe("tool discovery helpers", () => {
  it("applies sync logs to the plugin logger", () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
    };

    applySyncToolDiscoveryLogs(logger, [
      { level: "info", message: "loaded" },
      { level: "warn", message: "fallback" },
    ]);

    expect(logger.info).toHaveBeenCalledWith("loaded");
    expect(logger.warn).toHaveBeenCalledWith("fallback");
  });

  it("resolves the snapshot path under the OpenClaw state dir", () => {
    expect(resolveToolSnapshotPath("/tmp/openclaw-state")).toBe(
      "/tmp/openclaw-state/cache/aitoearn-tools.json"
    );
  });
});
