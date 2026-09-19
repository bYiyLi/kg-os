import { describe, expect, it } from "vitest";

import { evaluateDaemonCli } from "./cli.js";

describe("evaluateDaemonCli", () => {
  it("exposes only the implemented Phase 0 surface", () => {
    const result = evaluateDaemonCli(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage: kgosd");
    expect(result.stdout).toContain("production daemon lifecycle is not implemented yet");
  });

  it("prints the version", () => {
    expect(evaluateDaemonCli(["-V"]).stdout).toBe("0.0.0\n");
  });

  it("fails closed for lifecycle arguments", () => {
    expect(evaluateDaemonCli(["start"])).toEqual({
      exitCode: 2,
      stderr: "kgosd: production lifecycle is not implemented in Phase 0\n",
      stdout: ""
    });
  });
});
