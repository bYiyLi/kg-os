import { describe, expect, it } from "vitest";

import { evaluateCli } from "./index.js";

describe("evaluateCli", () => {
  it("shows Phase 0 help without claiming business commands", () => {
    const result = evaluateCli([]);

    expect(result).toMatchObject({ exitCode: 0, stderr: "" });
    expect(result.stdout).toContain("Usage: kg");
    expect(result.stdout).toContain("Business commands are not implemented yet");
  });

  it("prints the package version", () => {
    expect(evaluateCli(["--version"])).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "0.0.0\n"
    });
  });

  it("rejects unsupported business arguments", () => {
    expect(evaluateCli(["query"])).toEqual({
      exitCode: 2,
      stderr: "kg: unsupported Phase 0 argument: query\n",
      stdout: ""
    });
  });
});
