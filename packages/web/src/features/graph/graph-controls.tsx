import { useTranslation } from "react-i18next";

import { Button } from "../../shared/ui/button.js";
import { Icon } from "../../shared/ui/icon.js";

export function GraphControls({
  zoom,
  disabled,
  onZoom,
  onReset,
  onFit,
  onRelayout
}: {
  zoom: number;
  disabled: boolean;
  onZoom: (factor: number) => void;
  onReset: () => void;
  onFit: () => void;
  onRelayout: () => void;
}) {
  const { t } = useTranslation();
  const controls = [
    {
      key: "zoomOut",
      label: "−",
      blocked: zoom <= 0.05,
      action: () => {
        onZoom(1 / 1.2);
      }
    },
    {
      key: "zoomReset",
      label: String(Math.round(zoom * 100)) + "%",
      blocked: false,
      action: onReset
    },
    {
      key: "zoomIn",
      label: "+",
      blocked: zoom >= 3,
      action: () => {
        onZoom(1.2);
      }
    }
  ];
  return (
    <div className="graph-canvas-controls">
      <div className="graph-zoom-controls">
        {controls.map((control) => (
          <Button
            key={control.key}
            variant="ghost"
            className={
              control.key === "zoomReset" ? "graph-canvas-percentage" : "graph-canvas-button"
            }
            aria-label={t("graph." + control.key)}
            title={t("graph." + control.key)}
            disabled={disabled || control.blocked}
            onClick={control.action}
          >
            {control.label}
          </Button>
        ))}
      </div>
      <Button
        variant="ghost"
        className="graph-canvas-button graph-fit-button"
        aria-label={t("graph.fit")}
        title={t("graph.fit")}
        disabled={disabled}
        onClick={onFit}
      >
        <Icon name="fit" />
      </Button>
      <Button
        variant="ghost"
        className="graph-canvas-button graph-relayout-button"
        aria-label={t("graph.relayout")}
        title={t("graph.relayout")}
        disabled={disabled}
        onClick={onRelayout}
      >
        <Icon name="graph" />
      </Button>
    </div>
  );
}
