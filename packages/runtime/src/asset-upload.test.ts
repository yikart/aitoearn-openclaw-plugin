import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { uploadAssetFromPath } from "./asset-upload.js";

describe("uploadAssetFromPath", () => {
  let tempDir: string;
  let originalCwd: string;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "aitoearn-upload-"));
    originalCwd = process.cwd();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.unstubAllGlobals();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("uploads a local file via uploadSign, PUT, and confirm", async () => {
    const filePath = join(tempDir, "screenshot.png");
    await writeFile(filePath, Buffer.from("hello"));

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          code: 200,
          data: {
            id: "asset-1",
            uploadUrl: "https://upload.example.com/object",
          },
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        jsonResponse({
          code: 200,
          data: {
            id: "asset-1",
            path: "temp/asset-1.png",
            url: "https://cdn.example.com/temp/asset-1.png",
            type: "temp",
            filename: "screenshot.png",
            size: 5,
            mimeType: "image/png",
          },
        })
      );

    const result = await uploadAssetFromPath({
      apiKey: "test-api-key",
      baseUrl: "https://test.aitoearn.ai/api",
      filePath,
    });

    expect(result).toEqual({
      id: "asset-1",
      path: "temp/asset-1.png",
      url: "https://cdn.example.com/temp/asset-1.png",
      type: "temp",
      filename: "screenshot.png",
      size: 5,
      contentType: "image/png",
      filePath,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://test.aitoearn.ai/api/assets/uploadSign"
    );
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": "test-api-key",
        },
      })
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      filename: "screenshot.png",
      type: "temp",
      size: 5,
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://upload.example.com/object");
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        method: "PUT",
        headers: {
          "content-type": "image/png",
        },
      })
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      "https://test.aitoearn.ai/api/assets/asset-1/confirm"
    );
    expect(fetchMock.mock.calls[2]?.[1]).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: {
          "x-api-key": "test-api-key",
        },
      })
    );
  });

  it("supports relative file paths and custom type/filename/contentType", async () => {
    await mkdir(join(tempDir, "nested"), { recursive: true });
    await writeFile(join(tempDir, "nested", "capture.bin"), Buffer.from("abc"));
    process.chdir(tempDir);

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: {
            id: "asset-2",
            uploadUrl: "https://upload.example.com/custom",
          },
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: {
            id: "asset-2",
            path: "userMedia/asset-2.bin",
            url: "https://cdn.example.com/userMedia/asset-2.bin",
          },
        })
      );

    const result = await uploadAssetFromPath({
      apiKey: "test-api-key",
      baseUrl: "https://test.aitoearn.ai/api",
      filePath: "nested/capture.bin",
      type: "userMedia",
      filename: "renamed.dat",
      contentType: "application/custom",
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: "asset-2",
        path: "userMedia/asset-2.bin",
        url: "https://cdn.example.com/userMedia/asset-2.bin",
        type: "userMedia",
        filename: "renamed.dat",
        size: 3,
        contentType: "application/custom",
      })
    );
    expect(result.filePath.endsWith("/nested/capture.bin")).toBe(true);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      filename: "renamed.dat",
      type: "userMedia",
      size: 3,
    });
  });

  it("fails when the file does not exist", async () => {
    await expect(
      uploadAssetFromPath({
        apiKey: "test-api-key",
        baseUrl: "https://test.aitoearn.ai/api",
        filePath: join(tempDir, "missing.png"),
      })
    ).rejects.toThrow(
      `uploadAssetFromPath could not find file: ${join(tempDir, "missing.png")}`
    );
  });

  it("fails when filePath points to a directory", async () => {
    const dirPath = join(tempDir, "folder");
    await mkdir(dirPath, { recursive: true });

    await expect(
      uploadAssetFromPath({
        apiKey: "test-api-key",
        baseUrl: "https://test.aitoearn.ai/api",
        filePath: dirPath,
      })
    ).rejects.toThrow(
      `uploadAssetFromPath expected filePath to point to a file: ${dirPath}`
    );
  });

  it("fails when uploadSign returns an error response", async () => {
    const filePath = join(tempDir, "screenshot.png");
    await writeFile(filePath, Buffer.from("hello"));

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          code: 5001,
          message: "signature error",
        },
        200
      )
    );

    await expect(
      uploadAssetFromPath({
        apiKey: "test-api-key",
        baseUrl: "https://test.aitoearn.ai/api",
        filePath,
      })
    ).rejects.toThrow("asset uploadSign failed: signature error");
  });

  it("fails when uploadSign omits uploadUrl", async () => {
    const filePath = join(tempDir, "screenshot.png");
    await writeFile(filePath, Buffer.from("hello"));

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        code: 200,
        data: {
          id: "asset-3",
        },
      })
    );

    await expect(
      uploadAssetFromPath({
        apiKey: "test-api-key",
        baseUrl: "https://test.aitoearn.ai/api",
        filePath,
      })
    ).rejects.toThrow("asset uploadSign response is missing data.uploadUrl.");
  });

  it("fails when PUT upload returns a non-2xx status", async () => {
    const filePath = join(tempDir, "screenshot.png");
    await writeFile(filePath, Buffer.from("hello"));

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          code: 200,
          data: {
            id: "asset-4",
            uploadUrl: "https://upload.example.com/object",
          },
        })
      )
      .mockResolvedValueOnce(new Response("denied", { status: 403 }));

    await expect(
      uploadAssetFromPath({
        apiKey: "test-api-key",
        baseUrl: "https://test.aitoearn.ai/api",
        filePath,
      })
    ).rejects.toThrow("asset upload PUT failed with HTTP 403: denied");
  });

  it("fails when confirm returns a non-2xx status", async () => {
    const filePath = join(tempDir, "screenshot.png");
    await writeFile(filePath, Buffer.from("hello"));

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          code: 200,
          data: {
            id: "asset-5",
            uploadUrl: "https://upload.example.com/object",
          },
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response("confirm failed", { status: 500 }));

    await expect(
      uploadAssetFromPath({
        apiKey: "test-api-key",
        baseUrl: "https://test.aitoearn.ai/api",
        filePath,
      })
    ).rejects.toThrow("asset confirm failed with HTTP 500: confirm failed");
  });
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}
