import { describe, expect, it } from "vitest";

import { help } from "./index.js";

describe("SDK Help", () => {
  it("lists the 31 MCP-supported methods with stable access classifications", () => {
    const list = help();
    expect(list).toHaveLength(31);
    expect(new Set(list.map((item) => item.name)).size).toBe(31);
    expect(list.map((item) => item.name)).toEqual(
      [...list.map((item) => item.name)].sort((a, b) => a.localeCompare(b, "en"))
    );
    expect(list.filter((item) => item.access === "read")).toHaveLength(15);
    expect(list.filter((item) => item.access === "write")).toHaveLength(16);
  });

  it("returns complete nested Request/Result types and valid examples", () => {
    const state = help("evolution.state.create");
    expect(state.signature).toBe(
      "evolution.state.create(request: StateCreateRequest): Promise<StateCreateResult>"
    );
    expect(state.typeDefinitions.join("\n")).toContain("data?: JsonValue");
    expect(state.typeDefinitions.join("\n")).toContain("interface StateCreateResult");
    expect(state.example).toContain("evolution.state.create({");

    const merge = help("evolution.merge.resolve");
    const types = merge.typeDefinitions.join("\n");
    expect(types).toContain("interface MergeResolveRequest");
    expect(types).toContain("interface MergeResolution");
    expect(types).toContain("interface MergeSessionSummary");
    expect(merge.example).toContain("expectedRevision");
  });

  it("rejects unknown methods and does not let callers mutate shared data", () => {
    expect(() => help("evolution.notReal")).toThrow("Unknown KG OS SDK method");
    expect(() => help(null as unknown as string)).toThrow("non-empty method name");
    const fromJavaScript = help as (...names: string[]) => unknown;
    expect(() => fromJavaScript("evolution.overview", "extra")).toThrow("at most one method name");
    const item = help("evolution.state.create");
    item.typeDefinitions.push("tampered");
    expect(help("evolution.state.create").typeDefinitions).not.toContain("tampered");
  });
});
