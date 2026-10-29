// cspell:words relayout

import { useImperativeHandle } from "react";
import { useTranslation } from "react-i18next";

import { GraphControls } from "./graph-controls.js";
import { GraphG6Keyboard } from "./graph-g6-keyboard.js";
import { useGraphG6Controller } from "./use-graph-g6-controller.js";
import type { GraphSceneHandle, GraphSceneProps } from "./graph-g6-types.js";
import "./graph-scene.css";

export type { GraphSceneHandle, GraphSceneContextTarget } from "./graph-g6-types.js";

export function GraphScene(props: GraphSceneProps) {
  const { t } = useTranslation();
  const { surface, renderer, controller, scale, ready } = useGraphG6Controller(props);

  useImperativeHandle<GraphSceneHandle, GraphSceneHandle>(props.ref, () => ({
    focusNode: (id) => {
      controller.focusNode(id);
    },
    togglePin: (id) => {
      controller.togglePin(id);
    },
    isPinned: (id) => controller.pinned.has(id),
    fit: () => {
      controller.fit();
    },
    relayout: () => {
      controller.reflow(true);
    }
  }));

  return (
    <>
      <div
        ref={surface}
        className={"graph-scene" + (props.disabled === true ? " is-disabled" : "")}
        role="group"
        data-zoom={scale}
        data-ready={ready}
        aria-busy={!ready}
        aria-label={t("workspace.canvas")}
        tabIndex={props.disabled === true ? -1 : 0}
        onKeyDown={(event) => {
          if (event.target === event.currentTarget) controller.handleKey(event, null);
        }}
      >
        <div ref={renderer} className="graph-scene-renderer" aria-hidden="true" />
        <GraphG6Keyboard controller={controller} props={props} ready={ready} />
      </div>
      <GraphControls
        zoom={scale}
        disabled={props.disabled === true || !ready || props.data.nodes.length === 0}
        onZoom={(factor) => {
          controller.zoomBy(factor);
        }}
        onReset={() => {
          controller.resetZoom();
        }}
        onFit={() => {
          controller.fit();
        }}
        onRelayout={() => {
          controller.reflow(true);
        }}
      />
    </>
  );
}
