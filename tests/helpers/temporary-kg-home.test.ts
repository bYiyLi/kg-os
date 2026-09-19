import { access } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { createTemporaryKgHome } from "./temporary-kg-home.js";

describe("createTemporaryKgHome", () => {
  it("creates an isolated profile and removes it idempotently", async () => {
    const temporary = await createTemporaryKgHome();

    try {
      await expect(access(temporary.home)).resolves.toBeUndefined();
      expect(temporary.environment["KG_HOME"]).toBe(temporary.home);
    } finally {
      await temporary.cleanup();
    }

    await expect(access(temporary.home)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(temporary.cleanup()).resolves.toBeUndefined();
  });
});
