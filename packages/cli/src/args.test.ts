import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertPositionals,
  extractRoot,
  optionalInteger,
  parseOptions,
  requiredInteger,
  requiredValue
} from "./args.js";
import { CLIError } from "./errors.js";

describe("CLI argument parsing", () => {
  it("resolves a relative root and preserves command arguments", () => {
    expect(extractRoot(["--root", "./instance", "object", "read"])).toEqual({
      root: resolve("./instance"),
      args: ["object", "read"]
    });
    expect(extractRoot(["object", "--root", "./instance", "read"]).args).toEqual([
      "object",
      "read"
    ]);
  });

  it("rejects missing and duplicate roots", () => {
    expect(() => extractRoot(["object"])).toThrow(CLIError);
    expect(() => extractRoot(["--root"])).toThrow(CLIError);
    expect(() => extractRoot(["--root", "a", "--root", "b"])).toThrow(CLIError);
  });

  it("parses boolean, value, and positional options", () => {
    const parsed = parseOptions(["node:a", "--pretty", "--at", "branch/main"], {
      boolean: ["--pretty"],
      value: ["--at"]
    });
    expect(parsed.positionals).toEqual(["node:a"]);
    expect(parsed.booleans.has("--pretty")).toBe(true);
    expect(requiredValue(parsed, "--at")).toBe("branch/main");
  });

  it("rejects duplicate, unknown, and valueless options", () => {
    expect(() => parseOptions(["--pretty", "--pretty"], { boolean: ["--pretty"] })).toThrow(
      CLIError
    );
    expect(() => parseOptions(["--unknown"], {})).toThrow(CLIError);
    expect(() => parseOptions(["--at"], { value: ["--at"] })).toThrow(CLIError);
    expect(() => parseOptions(["--at", "a", "--at", "b"], { value: ["--at"] })).toThrow(CLIError);
  });

  it("validates integer options and positional counts", () => {
    const parsed = parseOptions(["x", "--limit", "10", "--revision", "2"], {
      value: ["--limit", "--revision"]
    });
    expect(optionalInteger(parsed, "--limit", 1, 100)).toBe(10);
    expect(optionalInteger(parseOptions([], {}), "--limit", 1, 100)).toBeUndefined();
    expect(requiredInteger(parsed, "--revision", 1)).toBe(2);
    expect(() => {
      assertPositionals(parsed, 1, 1, "one required");
    }).not.toThrow();
    expect(() =>
      optionalInteger(parseOptions(["--limit", "0"], { value: ["--limit"] }), "--limit", 1, 5)
    ).toThrow(CLIError);
    expect(() => {
      requiredInteger(
        parseOptions(["--revision", "-1"], { value: ["--revision"] }),
        "--revision",
        0
      );
    }).toThrow(CLIError);
    expect(() => {
      assertPositionals(parseOptions([], {}), 1, 1, "one required");
    }).toThrow(CLIError);
  });
});
