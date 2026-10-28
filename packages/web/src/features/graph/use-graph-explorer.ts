import { useState } from "react";
import type { ResolvedState } from "@kgos/sdk";

import type { GraphReader } from "./graph-search.js";
import { useGraphSearch } from "./use-graph-search.js";
import { useGraphSelection } from "./use-graph-selection.js";

export function useGraphExplorer(reader: GraphReader | null, state: ResolvedState | null) {
  const [busy, setBusy] = useState(false);
  const selection = useGraphSelection({ reader, state, searching: busy });
  const search = useGraphSearch({ reader, state, setBusy, ...selection });
  return { ...selection, ...search, busy };
}
