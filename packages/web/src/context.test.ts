import { describe, expect, it, vi } from "vitest";

import { Connection } from "./connection.js";
import { Context } from "./context.js";

async function prepared() {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({ daemonBootId: "boot", storeId: "store", storageStatus: "ready" })
    );
  const connection = new Connection("http://127.0.0.1:42", fetcher);
  await connection.connect("opaque");
  const context = new Context(connection);
  context.state = "commit/original";
  context.branches = [{ name: "main", state: context.state }];
  return { connection, context, fetcher };
}

describe("immutable browsing context", () => {
  it("discards older successful and failed selections after the newest one resolves", async () => {
    const { context, fetcher } = await prepared();
    const older = Promise.withResolvers<Response>();
    const newer = Promise.withResolvers<Response>();
    fetcher.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const first = context.select("branch/old");
    const second = context.select("tag/release", "commit/pinned");
    expect(context.state).toBe("commit/original");
    expect(context.runnable).toBe(false);
    expect(fetcher.mock.calls[1]?.[1]?.signal?.aborted).toBe(true);
    expect(fetcher.mock.calls[2]?.[1]?.body).toContain('"state":"commit/pinned"');
    newer.resolve(Response.json({ state: "commit/new" }));
    expect(await second).toBe(true);
    older.resolve(
      Response.json({ code: "STATE_NOT_FOUND", message: "older failure" }, { status: 404 })
    );
    expect(await first).toBe(false);
    expect(context.state).toBe("commit/new");
    expect(context.inputRef).toBe("tag/release");
    expect(context.targetBranch).toBe("main");
    expect(context.switchError).toBe("");
    expect(context.runnable).toBe(true);
  });

  it("only switches the branch target after a successful resolution", async () => {
    const { context, fetcher } = await prepared();
    fetcher.mockResolvedValueOnce(Response.json({ state: "commit/side" }));
    expect(await context.select("branch/side")).toBe(true);
    expect(context.targetBranch).toBe("side");
    expect(context.editable).toBe(false);
    context.branches.push({ name: "side", state: "commit/side" });
    expect(context.editable).toBe(true);
    fetcher.mockResolvedValueOnce(Response.json({ state: "commit/history" }));
    await context.select("commit/history");
    expect(context.editable).toBe(false);
    expect(context.observedTarget).toBe("commit/history");
    expect(context.refMissing).toBe(false);
  });

  it("observes moved and deleted branch/tag pointers without replacing the pinned State", async () => {
    const { context, fetcher } = await prepared();
    fetcher
      .mockResolvedValueOnce(Response.json({ items: [{ name: "main", state: "commit/moved" }] }))
      .mockResolvedValueOnce(Response.json({ items: [{ name: "release", state: "commit/tag" }] }));
    await context.observe();
    expect(context.state).toBe("commit/original");
    expect(context.headChanged).toBe(true);
    expect(context.refMissing).toBe(false);
    expect(context.editable).toBe(false);
    context.inputRef = "tag/release";
    expect(context.observedTarget).toBe("commit/tag");
    context.inputRef = "branch/missing";
    expect(context.refMissing).toBe(true);
    expect(context.headChanged).toBe(false);
    expect(context.runnable).toBe(true);
    context.inputRef = "tag/missing";
    expect(context.refMissing).toBe(true);
  });

  it("does not overlap observations or apply responses after disconnect", async () => {
    const { connection, context, fetcher } = await prepared();
    const branches = Promise.withResolvers<Response>();
    const tags = Promise.withResolvers<Response>();
    fetcher.mockReturnValueOnce(branches.promise).mockReturnValueOnce(tags.promise);
    const pending = context.observe();
    const duplicate = context.observe();
    expect(fetcher).toHaveBeenCalledTimes(3);
    connection.disconnect();
    branches.resolve(Response.json({ items: [{ name: "main", state: "commit/late" }] }));
    tags.resolve(Response.json({ items: [] }));
    await Promise.all([pending, duplicate]);
    expect(context.branches).toEqual([{ name: "main", state: "commit/original" }]);
    expect(context.observedAt).toBe(0);
    expect(await context.select("branch/main")).toBe(false);
    await context.observe();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("retains reference observations when reading them fails", async () => {
    const { context, fetcher } = await prepared();
    fetcher
      .mockResolvedValueOnce(
        Response.json({ code: "RESOURCE_ERROR", message: "ref list unavailable" }, { status: 500 })
      )
      .mockResolvedValueOnce(Response.json({ items: [] }));
    await context.observe();
    expect(context.observationError).toContain("ref list unavailable");
    expect(context.branches).toEqual([{ name: "main", state: "commit/original" }]);
    expect(context.state).toBe("commit/original");
    expect(context.runnable).toBe(true);
  });
});
