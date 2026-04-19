import { describe, expect, it } from "vitest";

import { sanitizeToolParams } from "./tool-params.js";

describe("sanitizeToolParams", () => {
  it("removes non-required empty and placeholder values while preserving valid falsy values", () => {
    const result = sanitizeToolParams(
      {
        emptyString: "   ",
        placeholderText: "placeholder",
        zero: 0,
        flag: false,
        nested: {
          city: " ",
          country: "CN",
        },
        list: [" ", "value", "https://placeholder.invalid/remove-me"],
      },
      {
        type: "object",
        properties: {
          emptyString: { type: "string" },
          placeholderText: { type: "string" },
          zero: { type: "number" },
          flag: { type: "boolean" },
          nested: {
            type: "object",
            properties: {
              city: { type: "string" },
              country: { type: "string" },
            },
          },
          list: {
            type: "array",
            items: { type: "string" },
          },
        },
      }
    );

    expect(result).toEqual({
      zero: 0,
      flag: false,
      nested: {
        country: "CN",
      },
      list: ["value"],
    });
  });

  it("keeps placeholder values for required fields", () => {
    const result = sanitizeToolParams(
      {
        title: "placeholder",
        imgUrlList: ["https://placeholder.invalid/remove-me"],
        payload: {
          caption: " ",
          workLink: "https://placeholder.invalid/remove-me",
        },
      },
      {
        type: "object",
        required: ["title", "imgUrlList", "payload"],
        properties: {
          title: { type: "string" },
          imgUrlList: {
            type: "array",
            items: { type: "string" },
          },
          payload: {
            type: "object",
            required: ["workLink"],
            properties: {
              caption: { type: "string" },
              workLink: { type: "string" },
            },
          },
        },
      }
    );

    expect(result).toEqual({
      title: "placeholder",
      imgUrlList: ["https://placeholder.invalid/remove-me"],
      payload: {
        workLink: "https://placeholder.invalid/remove-me",
      },
    });
  });

  it("drops arrays and objects that become empty when they are not required", () => {
    const result = sanitizeToolParams(
      {
        imgUrlList: ["https://placeholder.invalid/remove-me"],
        shippingAddress: {
          address1: " ",
          city: " ",
        },
      },
      {
        type: "object",
        properties: {
          imgUrlList: {
            type: "array",
            items: { type: "string" },
          },
          shippingAddress: {
            type: "object",
            properties: {
              address1: { type: "string" },
              city: { type: "string" },
            },
          },
        },
      }
    );

    expect(result).toEqual({});
  });

  it("supports prefixItems when cleaning tuple arrays", () => {
    const result = sanitizeToolParams(
      {
        time: ["2026-01-01T00:00:00Z", " "],
      },
      {
        type: "object",
        properties: {
          time: {
            type: "array",
            prefixItems: [
              { type: "string" },
              { type: "string" },
            ],
          },
        },
      }
    );

    expect(result).toEqual({
      time: ["2026-01-01T00:00:00Z"],
    });
  });
});
