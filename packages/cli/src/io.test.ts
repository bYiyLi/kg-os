import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { CLIError } from "./errors.js";
import { outputJSON, parseJSON, parseJSONObject, readTextFile, requireNonEmptyText } from "./io.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CLI I/O", () => {
  it("reads bounded UTF-8 files", async () => {
    const root = await mkdtemp(join(tmpdir(), "kgos-io-"));
    const path = join(root, "input.txt");
    await writeFile(path, "hello");
    await expect(readTextFile(path, "input")).resolves.toBe("hello");
    await expect(readTextFile(join(root, "missing"), "input")).rejects.toMatchObject({
      code: "IO_ERROR"
    });
  });

  it("classifies invalid UTF-8 and oversized input", async () => {
    const root = await mkdtemp(join(tmpdir(), "kgos-io-"));
    const invalid = join(root, "invalid");
    await writeFile(invalid, Buffer.from([0xff]));
    await expect(readTextFile(invalid, "input")).rejects.toMatchObject({ code: "PARSE_ERROR" });

    const large = join(root, "large");
    await writeFile(large, Buffer.alloc((16 << 20) + 1));
    await expect(readTextFile(large, "input")).rejects.toMatchObject({ code: "RESOURCE_ERROR" });
  });

  it("parses JSON values and objects", () => {
    expect(parseJSON("null", "data")).toBeNull();
    expect(parseJSONObject('{"a":1}', "params")).toEqual({ a: 1 });
    expect(() => parseJSON("{", "data")).toThrow(CLIError);
    expect(() => parseJSONObject("[]", "params")).toThrow(CLIError);
  });

  it("writes compact and pretty JSON and validates non-empty text", () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    outputJSON({ a: 1 }, false);
    outputJSON({ a: 1 }, true);
    expect(String(write.mock.calls[0]?.[0])).toBe('{"a":1}\n');
    expect(String(write.mock.calls[1]?.[0])).toContain('"a": 1');
    expect(requireNonEmptyText("x", "text")).toBe("x");
    expect(() => requireNonEmptyText("", "text")).toThrow(CLIError);
  });
});
