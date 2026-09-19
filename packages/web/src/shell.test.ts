import { describe, expect, it } from "vitest";

import { mountShell } from "./shell.js";

describe("mountShell", () => {
  it("renders the Phase 0 boundary", () => {
    const mount = { innerHTML: "" };

    mountShell(mount);

    expect(mount.innerHTML).toContain("KG OS");
    expect(mount.innerHTML).toContain("Development shell ready");
    expect(mount.innerHTML).toContain("业务 API 尚未实现");
  });

  it("rejects a missing mount point", () => {
    expect(() => {
      mountShell(null);
    }).toThrow("Missing #app mount point");
  });
});
