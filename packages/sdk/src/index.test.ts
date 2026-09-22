import { describe, expect, it } from "vitest";

import { KGOS_VERSION, PRODUCT_NAME, type JsonValue } from "./index.js";

describe("SDK engineering boundary", () => {
  it("exports stable Phase 00 metadata and JSON types", () => {
    const value: JsonValue = { product: PRODUCT_NAME, version: KGOS_VERSION };

    expect(value).toEqual({ product: "KG OS", version: "0.0.0" });
  });
});
