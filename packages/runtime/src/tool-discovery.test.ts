import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applySyncToolDiscoveryLogs,
  loadToolDefinitionsSync,
  resolveToolSnapshotPath,
  runToolDiscoveryWorkerSync,
} from "./tool-discovery.js";

describe("runToolDiscoveryWorkerSync", () => {
  it("returns the worker payload when the worker writes a result", () => {
    const stdout = runToolDiscoveryWorkerSync({
      configRuntimeModuleSpecifier: "file:///tmp/config-runtime.js",
      createWorker: (_filename, options) => {
        const data = options.workerData as {
          resultBuffer: SharedArrayBuffer;
          stateBuffer: SharedArrayBuffer;
        };
        const state = new Int32Array(data.stateBuffer);
        const buffer = new Uint8Array(data.resultBuffer);
        const encoded = new TextEncoder().encode(
          JSON.stringify({
            status: "ok",
            tools: [],
            invalidCount: 0,
            duplicateCount: 0,
          })
        );

        buffer.set(encoded);
        Atomics.store(state, 1, encoded.length);
        Atomics.store(state, 0, 1);
        Atomics.notify(state, 0, 1);

        return {
          terminate: async () => 0,
        };
      },
      env: {},
      payload: {
        config: {},
        pluginConfig: {
          apiKey: "test-api-key",
          baseUrl: "https://aitoearn.ai/api",
        },
      },
      resultBufferBytes: 1024,
      timeoutMs: 50,
      workerPath: new URL("file:///tmp/tool-discovery-worker.js"),
    });

    expect(JSON.parse(stdout)).toEqual({
      status: "ok",
      tools: [],
      invalidCount: 0,
      duplicateCount: 0,
    });
  });

  it("throws when the worker times out", () => {
    expect(() =>
      runToolDiscoveryWorkerSync({
        configRuntimeModuleSpecifier: "file:///tmp/config-runtime.js",
        createWorker: () => ({
          terminate: async () => 0,
        }),
        env: {},
        payload: {
          config: {},
          pluginConfig: {
            apiKey: "test-api-key",
            baseUrl: "https://aitoearn.ai/api",
          },
        },
        resultBufferBytes: 256,
        timeoutMs: 1,
        workerPath: new URL("file:///tmp/tool-discovery-worker.js"),
      })
    ).toThrow("timed out");
  });

  it("throws when the worker payload exceeds the shared buffer", () => {
    expect(() =>
      runToolDiscoveryWorkerSync({
        configRuntimeModuleSpecifier: "file:///tmp/config-runtime.js",
        createWorker: (_filename, options) => {
          const data = options.workerData as {
            stateBuffer: SharedArrayBuffer;
          };
          const state = new Int32Array(data.stateBuffer);

          Atomics.store(state, 1, 2048);
          Atomics.store(state, 0, 2);
          Atomics.notify(state, 0, 1);

          return {
            terminate: async () => 0,
          };
        },
        env: {},
        payload: {
          config: {},
          pluginConfig: {
            apiKey: "test-api-key",
            baseUrl: "https://aitoearn.ai/api",
          },
        },
        resultBufferBytes: 256,
        timeoutMs: 50,
        workerPath: new URL("file:///tmp/tool-discovery-worker.js"),
      })
    ).toThrow("exceeded");
  });
});

describe("loadToolDefinitionsSync", () => {
  const createWorker = vi.fn();
  const mkdirSync = vi.fn();
  const readFileSync = vi.fn();
  const renameSync = vi.fn();
  const writeFileSync = vi.fn();

  beforeEach(() => {
    createWorker.mockReset();
    mkdirSync.mockReset();
    readFileSync.mockReset();
    renameSync.mockReset();
    writeFileSync.mockReset();
  });

  it("uses remote tools and writes a snapshot when helper succeeds", () => {
    createWorker.mockImplementation((_filename, options) => {
      const data = options.workerData as {
        resultBuffer: SharedArrayBuffer;
        stateBuffer: SharedArrayBuffer;
      };
      const state = new Int32Array(data.stateBuffer);
      const buffer = new Uint8Array(data.resultBuffer);
      const encoded = new TextEncoder().encode(
        JSON.stringify({
          status: "ok",
          tools: [
            {
              name: "listMyPublishedTasks",
              description: "Remote",
              inputSchema: {
                type: "object",
                properties: {
                  time: {
                    type: "array",
                    items: [
                      {
                        type: "string",
                        format: "date-time",
                      },
                      {
                        type: "string",
                        format: "date-time",
                      },
                    ],
                  },
                },
              },
            },
          ],
          invalidCount: 0,
          duplicateCount: 0,
        })
      );

      buffer.set(encoded);
      Atomics.store(state, 1, encoded.length);
      Atomics.store(state, 0, 1);
      Atomics.notify(state, 0, 1);

      return {
        terminate: async () => 0,
      };
    });

    const result = loadToolDefinitionsSync({
      config: {},
      pluginConfig: {
        apiKey: "test-api-key",
        baseUrl: "https://aitoearn.ai/api",
      },
      stateDir: "/tmp/openclaw-state",
      deps: {
        createWorker,
        fs: {
          mkdirSync,
          readFileSync,
          renameSync,
          writeFileSync,
        },
        now: () => 12345,
        pid: 4321,
        workerPath: new URL("file:///tmp/helper.js"),
      },
    });

    expect(result.source).toBe("remote");
    expect(result.tools).toEqual([
      {
        name: "listMyPublishedTasks",
        description: "Remote",
        inputSchema: {
          type: "object",
          properties: {
            time: {
              type: "array",
              items: {
                type: "string",
                format: "date-time",
              },
              minItems: 2,
              maxItems: 2,
            },
          },
        },
      },
    ]);
    expect(createWorker).toHaveBeenCalled();
    expect(writeFileSync).toHaveBeenCalledWith(
      "/tmp/openclaw-state/cache/aitoearn-tools.json.4321.12345.tmp",
      expect.stringContaining('"minItems": 2'),
      "utf8"
    );
    expect(renameSync).toHaveBeenCalledWith(
      "/tmp/openclaw-state/cache/aitoearn-tools.json.4321.12345.tmp",
      "/tmp/openclaw-state/cache/aitoearn-tools.json"
    );
  });

  it("falls back to cached snapshot when helper returns sync_error", () => {
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
        createWorker: () => ({
          terminate: async () => 0,
        }),
        fs: {
          mkdirSync,
          readFileSync,
          renameSync,
          writeFileSync,
        },
        timeoutMs: 1,
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

  it("returns none when no cached snapshot is available", () => {
    const result = loadToolDefinitionsSync({
      config: {},
      pluginConfig: {
        apiKey: "test-api-key",
        baseUrl: "https://aitoearn.ai/api",
      },
      stateDir: "/tmp/openclaw-state",
      deps: {
        createWorker: () => ({
          terminate: async () => 0,
        }),
        fs: {
          mkdirSync,
          readFileSync,
          renameSync,
          writeFileSync,
        },
        timeoutMs: 1,
      },
    });

    expect(result.source).toBe("none");
    expect(result.tools).toEqual([]);
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
