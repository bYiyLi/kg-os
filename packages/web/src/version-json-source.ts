import { type KGOSClient } from "@kgos/sdk";

import { jsonSourceField } from "./json-source.js";

export async function readStateSource(client: KGOSClient, state: string, signal: AbortSignal) {
  let dataSource: string | undefined;
  const value = await client.evolution.get(
    { state },
    {
      signal,
      onJSONResponse: (source) => {
        dataSource = jsonSourceField(source, "data");
      }
    }
  );
  return { value, dataSource };
}
