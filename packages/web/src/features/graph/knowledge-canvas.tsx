import { useEffect, useRef, useState } from "react";
import type { ResolvedState } from "@kgos/sdk";

import type { GraphReader } from "./graph-search.js";
import { GraphScene } from "./graph-scene.js";
import type { GraphSceneHandle } from "./graph-scene.js";
import { GraphSearchStatus } from "./graph-search-status.js";
import { GraphSearchBox } from "./graph-search-box.js";
import { useGraphExplorer } from "./use-graph-explorer.js";
import { CanvasDetails } from "./canvas-details.js";
import { GraphInteractionFeedback } from "./graph-interaction-feedback.js";
import { useCanvasActions } from "./use-canvas-actions.js";
import "./knowledge-canvas.css";

const readerKeys = new WeakMap<GraphReader, number>();
let readerSequence = 0;
function readerKey(reader: GraphReader | null) {
  if (reader === null) return "offline";
  let key = readerKeys.get(reader);
  if (key === undefined) {
    key = ++readerSequence;
    readerKeys.set(reader, key);
  }
  return String(key);
}

interface CanvasProps {
  reader: GraphReader | null;
  state: ResolvedState | null;
  domain?: string | null;
  domainLabel?: string | null;
  blocked: boolean;
}

// A different connection or immutable State owns a fresh scene and requests.
export function KnowledgeCanvas(props: CanvasProps) {
  return (
    <CanvasSession
      key={readerKey(props.reader) + ":" + String(props.state) + ":" + (props.domain ?? "")}
      {...props}
    />
  );
}

function CanvasSession({ reader, state, domain, domainLabel, blocked }: CanvasProps) {
  const surface = useRef<HTMLDivElement | null>(null);
  const scene = useRef<GraphSceneHandle | null>(null);
  const [pinned, setPinned] = useState<ReadonlySet<string>>(() => new Set());
  const explorer = useGraphExplorer(reader, state, domain ?? undefined);
  const disabled = blocked || reader === null || state === null;
  const actions = useCanvasActions(explorer, surface, scene, disabled);
  // A new connection/State mounts a new session. Load real knowledge without
  // requiring a keyword; React StrictMode may re-run the effect safely.
  useEffect(() => {
    if (reader !== null && state !== null) void explorer.search("");
  }, [reader, state, domain]);
  return (
    <div className="knowledge-canvas" ref={surface} onKeyDown={actions.keyDown}>
      <GraphScene
        key={explorer.scene}
        ref={scene}
        data={explorer.data}
        selected={explorer.selected}
        highlighted={explorer.highlighted}
        onSelect={explorer.select}
        onFocusNode={explorer.focusNode}
        onToggleExpand={(id) => {
          explorer.toggleExpand(id);
        }}
        onContextMenu={actions.openMenu}
        expanded={explorer.expanded}
        expandingIds={explorer.expandingIds}
        onPinnedChange={setPinned}
        disabled={disabled}
      />
      <GraphSearchBox
        disabled={disabled}
        busy={explorer.busy}
        onSearch={(query) => {
          void explorer.search(query);
        }}
        onClear={() => {
          void explorer.search("");
        }}
      />
      <GraphSearchStatus
        data={explorer.data}
        routes={explorer.routes}
        failed={explorer.failed}
        state={state}
        domainLabel={domainLabel ?? null}
      />
      <GraphInteractionFeedback explorer={explorer} />
      <CanvasDetails
        explorer={explorer}
        actions={actions}
        surface={surface}
        scene={scene}
        pinned={pinned}
        disabled={disabled || explorer.busy}
      />
    </div>
  );
}
