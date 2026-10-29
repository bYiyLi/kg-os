import type { Ref } from "react";

import type { GraphData } from "./graph-data.js";

export interface GraphSceneContextTarget {
  id: string | null;
  x: number;
  y: number;
}

export interface GraphSceneHandle {
  focusNode: (id: string) => void;
  togglePin: (id: string) => void;
  isPinned: (id: string) => boolean;
  fit: () => void;
  relayout: () => void;
}

export interface GraphSceneProps {
  data: GraphData;
  selected: string | null;
  highlighted?: string | null;
  onSelect: (id: string | null) => void;
  onFocusNode?: ((id: string) => void) | undefined;
  onToggleExpand?: ((id: string) => void) | undefined;
  onContextMenu?: ((target: GraphSceneContextTarget) => void) | undefined;
  onPinnedChange?: ((ids: ReadonlySet<string>) => void) | undefined;
  expanded?: ReadonlySet<string>;
  expandingIds?: ReadonlySet<string>;
  disabled?: boolean;
  ref?: Ref<GraphSceneHandle>;
}
