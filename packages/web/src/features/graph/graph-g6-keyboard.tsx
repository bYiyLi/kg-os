import { useTranslation } from "react-i18next";

import { nodeCaption } from "./graph-data.js";
import type { GraphNode, GraphRelationship } from "./graph-data.js";
import type { GraphG6Controller } from "./graph-g6-controller.js";
import type { GraphSceneProps } from "./graph-g6-types.js";

interface ProxyProps {
  controller: GraphG6Controller;
  props: GraphSceneProps;
  ready: boolean;
}

function NodeKeyboard({ node, controller, props, ready }: ProxyProps & { node: GraphNode }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="graph-node graph-node-keyboard"
      data-graph-id={node.id}
      data-node-id={node.id}
      data-pinned={controller.pinned.has(node.id)}
      disabled={props.disabled === true || !ready}
      aria-label={t("graph.node", { name: nodeCaption(node), id: node.id })}
      aria-pressed={props.selected === node.id}
      aria-expanded={
        props.onToggleExpand === undefined ? undefined : props.expanded?.has(node.id) === true
      }
      aria-busy={props.expandingIds?.has(node.id) === true}
      onKeyDown={(event) => {
        controller.handleKey(event, node.id);
      }}
      onFocus={() => {
        controller.focusState(node.id, true);
      }}
      onBlur={() => {
        controller.focusState(node.id, false);
      }}
    >
      <span className="sr-only">{nodeCaption(node)}</span>
    </button>
  );
}

function RelationshipKeyboard({
  edge,
  controller,
  props,
  ready
}: ProxyProps & { edge: GraphRelationship }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="graph-relationship graph-relationship-keyboard"
      data-graph-id={edge.id}
      data-relationship-id={edge.id}
      disabled={props.disabled === true || !ready}
      aria-label={t("graph.relationship", { name: edge.type, id: edge.id })}
      aria-pressed={props.selected === edge.id}
      onKeyDown={(event) => {
        controller.handleKey(event, edge.id);
      }}
      onFocus={() => {
        controller.focusState(edge.id, true);
      }}
      onBlur={() => {
        controller.focusState(edge.id, false);
      }}
    >
      <span className="sr-only">{edge.type}</span>
    </button>
  );
}

export function GraphG6Keyboard({ controller, props, ready }: ProxyProps) {
  return (
    <div className="graph-scene-keyboard">
      {props.data.nodes.map((node) => (
        <NodeKeyboard
          key={node.id}
          node={node}
          controller={controller}
          props={props}
          ready={ready}
        />
      ))}
      {props.data.relationships.map((edge) => (
        <RelationshipKeyboard
          key={edge.id}
          edge={edge}
          controller={controller}
          props={props}
          ready={ready}
        />
      ))}
    </div>
  );
}
