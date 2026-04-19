import { describe, expect, it } from "vitest";
import { normalizeToolInputSchema, sanitizeToolDefinitions } from "./tools.js";

describe("normalizeToolInputSchema", () => {
  it("converts tuple items into a fixed-length array schema", () => {
    const schema = normalizeToolInputSchema({
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
    });

    expect(schema).toEqual({
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
    });
  });

  it("preserves tuple semantics for mixed item types via prefixItems", () => {
    const schema = normalizeToolInputSchema({
      type: "object",
      properties: {
        range: {
          type: "array",
          items: [
            {
              type: "string",
            },
            {
              type: "integer",
            },
          ],
          additionalItems: false,
        },
      },
    });

    expect(schema).toEqual({
      type: "object",
      properties: {
        range: {
          type: "array",
          prefixItems: [
            {
              type: "string",
            },
            {
              type: "integer",
            },
          ],
          items: false,
          minItems: 2,
          maxItems: 2,
        },
      },
    });
  });

  it("converts legacy schema id to $id without touching property names", () => {
    const schema = normalizeToolInputSchema({
      id: "create-video-draft",
      type: "object",
      properties: {
        id: {
          type: "string",
        },
        payload: {
          id: "video-payload",
          type: "object",
          properties: {
            id: {
              type: "string",
            },
            clips: {
              type: "array",
              prefixItems: [
                {
                  id: "clip-item",
                  type: "string",
                },
              ],
            },
          },
        },
      },
    });

    expect(schema).toEqual({
      $id: "create-video-draft",
      type: "object",
      properties: {
        id: {
          type: "string",
        },
        payload: {
          $id: "video-payload",
          type: "object",
          properties: {
            id: {
              type: "string",
            },
            clips: {
              type: "array",
              prefixItems: [
                {
                  $id: "clip-item",
                  type: "string",
                },
              ],
            },
          },
        },
      },
    });
  });

  it("keeps an existing $id and removes the legacy id keyword", () => {
    const schema = normalizeToolInputSchema({
      id: "legacy-schema-id",
      $id: "canonical-schema-id",
      type: "object",
      properties: {},
    });

    expect(schema).toEqual({
      $id: "canonical-schema-id",
      type: "object",
      properties: {},
    });
  });
});

describe("sanitizeToolDefinitions", () => {
  it("normalizes nested tuple schemas in discovered tools", () => {
    const result = sanitizeToolDefinitions([
      {
        name: "listMyPublishedTasks",
        description: "Published tasks",
        inputSchema: {
          type: "object",
          properties: {
            filters: {
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
        },
      },
    ]);

    expect(result.tools).toEqual([
      {
        name: "listMyPublishedTasks",
        description: "Published tasks",
        inputSchema: {
          type: "object",
          properties: {
            filters: {
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
        },
      },
    ]);
  });
});
