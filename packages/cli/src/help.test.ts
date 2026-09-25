import { describe, expect, it } from "vitest";

import { commandHelp, rootHelp, versionText } from "./help.js";

describe("CLI help", () => {
  it("exposes the explicit-root command tree", () => {
    expect(rootHelp()).toContain("--root <instance-root>");
    expect(rootHelp()).toContain("ontology");
    expect(versionText()).toBe("0.1.0\n");
  });

  it.each(["doctor", "init", "ontology", "object", "graph", "evolution"])(
    "returns command help for %s",
    (command) => {
      expect(commandHelp([command])).toContain("Usage:");
    }
  );

  it("falls back to root help for unknown or absent commands", () => {
    expect(commandHelp([])).toBe(rootHelp());
    expect(commandHelp(["unknown"])).toBe(rootHelp());
  });
});
