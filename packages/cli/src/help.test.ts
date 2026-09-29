import { describe, expect, it } from "vitest";

import { commandHelp, rootHelp, versionText } from "./help.js";

describe("CLI help", () => {
  it("exposes Workspace Root precedence and the command tree", () => {
    expect(rootHelp()).toContain("--root <workspace-root>");
    expect(rootHelp()).toContain("KGOS_ROOT=<workspace-root>");
    expect(rootHelp()).toContain("--root > KGOS_ROOT");
    expect(rootHelp()).toContain("ontology");
    expect(versionText()).toBe("0.2.1\n");
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

  it("shows direct children at every namespace and complete leaf flags", () => {
    const evolution = commandHelp(["evolution", "--help"]);
    expect(evolution).toContain("branch");
    expect(evolution).toContain("tag");
    expect(evolution).toContain("merge");
    expect(evolution).not.toContain("--expected-revision");
    const branch = commandHelp(["evolution", "branch", "--help"]);
    expect(branch).toContain("create");
    expect(branch).toContain("delete");
    expect(branch).not.toContain("conflicts");
    const leaf = commandHelp(["evolution", "merge", "resolve", "--help"]);
    expect(leaf).toContain("--expected-revision <n>");
    expect(leaf).toContain("--resolutions-file <path>");
    expect(leaf).toContain("mutually exclusive");
    expect(leaf).toContain("Examples:");
    const init = commandHelp(["init", "--help"]);
    expect(init).toContain("--extensions-file <path> | --no-additional-extensions");
    expect(init).toContain("--fulltext-analyzer");
    expect(init).toContain("defaults to jieba");
    expect(commandHelp(["object", "read", "--help"])).toContain("--at branch/main");
    expect(commandHelp(["evolution", "merge", "start", "--help"])).toContain(
      "--source branch/experiment"
    );
  });

  it("keeps command topology in Chinese help", () => {
    const previous = process.env["LC_ALL"];
    try {
      process.env["LC_ALL"] = "zh_CN.UTF-8";
      expect(commandHelp(["evolution", "branch"])).toContain("创建 Branch");
      expect(commandHelp(["evolution", "branch"])).toContain("删除 Branch");
      expect(commandHelp(["graph", "query"])).toContain("--stream 与 --pretty 互斥");
    } finally {
      if (previous === undefined) delete process.env["LC_ALL"];
      else process.env["LC_ALL"] = previous;
    }
  });
});
