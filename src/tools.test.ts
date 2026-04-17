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

  it("preserves tuple semantics for mixed item types via anyOf", () => {
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
          items: {
            anyOf: [
              {
                type: "string",
              },
              {
                type: "integer",
              },
            ],
          },
          minItems: 2,
          maxItems: 2,
        },
      },
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
