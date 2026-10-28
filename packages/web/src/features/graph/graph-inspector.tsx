import { useTranslation } from "react-i18next";
import type { JsonValue } from "@kgos/sdk";

import { Button } from "../../shared/ui/button.js";
import { Icon } from "../../shared/ui/icon.js";
import { nodeCaption } from "./graph-data.js";
import type { GraphNode, GraphRelationship } from "./graph-data.js";

function PropertyValue({ value }: { value: JsonValue }) {
  const { t } = useTranslation();
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <>
      <pre>{text.slice(0, 4096)}</pre>
      {text.length > 4096 && <small>{t("graph.propertyPreview", { count: 4096 })}</small>}
    </>
  );
}

interface GraphInspectorProps {
  node: GraphNode | undefined;
  relationship: GraphRelationship | undefined;
  expanding: boolean;
  failed: boolean;
  disabled: boolean;
  expanded?: boolean;
  pinned?: boolean;
  onClose: () => void;
  onExpand: () => void;
  onCollapse?: () => void;
  onTogglePin?: () => void;
  onHide: () => void;
}

function expansionLabel(props: GraphInspectorProps) {
  if (props.expanding) return props.onCollapse === undefined ? "expanding" : "cancelExpand";
  return props.expanded === true ? "collapse" : "expand";
}

function InspectorActions(props: GraphInspectorProps) {
  const { t } = useTranslation();
  const collapse = props.expanded === true || props.expanding;
  const action = collapse && props.onCollapse !== undefined ? props.onCollapse : props.onExpand;
  const label = expansionLabel(props);
  return (
    <footer>
      {props.node !== undefined && (
        <>
          <Button
            variant="outline"
            disabled={props.disabled || (props.expanding && props.onCollapse === undefined)}
            onClick={action}
          >
            {t("graph." + label)}
          </Button>
          {props.onTogglePin !== undefined && (
            <Button variant="ghost" disabled={props.disabled} onClick={props.onTogglePin}>
              {t(props.pinned === true ? "graph.unpin" : "graph.pin")}
            </Button>
          )}
        </>
      )}
      <Button variant="ghost" disabled={props.disabled} onClick={props.onHide}>
        {t("graph.hide")}
      </Button>
      {props.failed && <p role="alert">{t("graph.expandFailed")}</p>}
    </footer>
  );
}

export function GraphInspector(props: GraphInspectorProps) {
  const { node, relationship, onClose } = props;
  const { t } = useTranslation();
  const item = node ?? relationship;
  if (item === undefined) return null;
  const caption = node === undefined ? (relationship?.type ?? item.id) : nodeCaption(node);
  return (
    <aside
      className="graph-inspector"
      aria-label={t("graph.details")}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header>
        <div>
          <small>{t(node === undefined ? "graph.relationshipDetails" : "graph.nodeDetails")}</small>
          <h2>{caption}</h2>
        </div>
        <Button
          variant="ghost"
          className="graph-inspector-close"
          aria-label={t("graph.closeDetails")}
          onClick={onClose}
        >
          <Icon name="close" />
        </Button>
      </header>
      <div className="graph-inspector-content">
        <p className="graph-object-id">{item.id}</p>
        {node !== undefined && (
          <p className="graph-object-labels">
            {node.labels.length === 0 ? t("graph.noLabels") : node.labels.join(" · ")}
          </p>
        )}
        {relationship !== undefined && (
          <p className="graph-endpoints">
            {relationship.start} → {relationship.end}
          </p>
        )}
        <dl>
          {Object.entries(item.properties).map(([name, value]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>
                <PropertyValue value={value} />
              </dd>
            </div>
          ))}
        </dl>
        {Object.keys(item.properties).length === 0 && <p>{t("graph.noProperties")}</p>}
      </div>
      <InspectorActions {...props} />
    </aside>
  );
}
