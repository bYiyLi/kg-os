import { type JsonObject } from "@kgos/sdk";

import { type Connection } from "./connection.js";

interface ReconcileSource {
  baseState: string;
  branch: string;
  refs: string[];
}

export async function readReconciliation(
  client: NonNullable<Connection["client"]>,
  connection: Connection,
  signal: AbortSignal,
  source: ReconcileSource
): Promise<JsonObject> {
  const branches = await client.evolution.branch.list({ signal });
  const head = branches.items.find((branch) => branch.name === source.branch)?.state;
  if (head === undefined) throw new Error("目标 Branch 不存在；保留草稿");
  const refs = source.refs.slice(0, 20);
  const objects = await Promise.all(
    refs.map(async (ref) => {
      try {
        const read = await client.object.readText({ at: head, refs: [ref] }, { signal });
        const item = read.results[0];
        if (read.state !== head || read.results.length !== 1 || item?.ref !== ref)
          throw new Error("核对资料未返回同一完整 State / Ref");
        return { ref, body: item.body };
      } catch (error) {
        return { ref, error: connection.failure(error) };
      }
    })
  );
  const history = await client.evolution.history(
    { root: head, scope: "all", limit: 20 },
    { signal }
  );
  if (history.root !== head) throw new Error("核对历史未返回同一 Branch head");
  return {
    head,
    baseState: source.baseState,
    objects,
    history: history.items.map((item) => ({
      state: item.state,
      path: item.change?.path ?? "",
      kind: item.change?.kind ?? "empty-delta"
    })),
    limited: refs.length < source.refs.length || history.cursor !== undefined
  };
}
