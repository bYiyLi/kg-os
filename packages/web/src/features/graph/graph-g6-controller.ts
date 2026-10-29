// cspell:words relayout

import type { Graph as G6Graph } from "@antv/g6";
import type { KeyboardEvent } from "react";

import { centerFocusScale, centerFocusStyle } from "./graph-center-focus.js";
import { graphPalette, graphToG6 } from "./graph-g6-data.js";
import type { GraphPoint } from "./graph-g6-data.js";
import { registerG6Events } from "./graph-g6-events.js";
import { updateGraphLabels } from "./graph-g6-attention.js";
import { graphBehaviors } from "./graph-g6-behaviors.js";
import { GraphFocusMotion } from "./graph-g6-focus-motion.js";
import {
  contextPosition,
  EMPTY_IDS,
  graphPositions,
  keyStep,
  syncKeyboard,
  topologyKey,
  zoomG6
} from "./graph-g6-geometry.js";
import { elementStates, forceLayout, newGraphOptions } from "./graph-g6-options.js";
import { G6PinchMidpoint } from "./graph-g6-pinch.js";
import { radialNeighborPositions } from "./graph-radial-placement.js";
import type { GraphSceneProps } from "./graph-g6-types.js";

interface ControllerFeedback {
  ready: (ready: boolean) => void;
  pins: (value: ReadonlySet<string>) => void;
  scale: (value: number) => void;
}

export class GraphG6Controller {
  private graph: G6Graph | null = null;
  private surface: HTMLElement | null = null;
  private props: GraphSceneProps;
  private readonly feedback: ControllerFeedback;
  private pins = new Set<string>();
  private reduced: boolean;
  private alive = false;
  private ready = false;
  private fitted = false;
  private structure: string;
  private generation = 0;
  private renderQueue: Promise<void> = Promise.resolve();
  private reflowPending = false;
  private suppressUntil = 0;
  private focusFrame: number | null = null;
  private pinch: G6PinchMidpoint | null = null;
  private unbindEvents: (() => void) | null = null;
  private pinStatesDirty = false;
  private focusMotion: GraphFocusMotion | null = null;
  private readonly focusScales = new Map<string, number>();

  constructor(props: GraphSceneProps, feedback: ControllerFeedback, reduced: boolean) {
    this.props = props;
    this.feedback = feedback;
    this.reduced = reduced;
    this.structure = topologyKey(props.data);
  }

  get pinned(): ReadonlySet<string> {
    return this.pins;
  }

  get zoom(): number {
    return this.graph === null || this.graph.destroyed ? 1 : this.graph.getZoom();
  }

  mount(host: HTMLElement, surface: HTMLElement) {
    this.alive = true;
    this.surface = surface;
    // Canvas 2D is unavailable in non-browser environments (e.g. jsdom).
    // Keep accessible graph data/controls without constructing an unusable G6 renderer.
    if (typeof CanvasRenderingContext2D === "undefined") {
      this.feedback.ready(true);
      return;
    }
    const token = ++this.generation;
    void this.initialize(host, surface, token);
  }

  private async initialize(host: HTMLElement, surface: HTMLElement, token: number) {
    try {
      const events = await import("@antv/g6");
      if (!this.alive || token !== this.generation) return;
      const graph = new events.Graph(
        newGraphOptions({
          host,
          surface,
          props: this.props,
          pinned: this.pins,
          reduced: this.reduced
        })
      );
      this.graph = graph;
      this.focusMotion = new GraphFocusMotion(graph);
      this.pinch = new G6PinchMidpoint(graph);
      this.pinch.attach();
      this.unbindEvents = registerG6Events(graph, events, {
        surface,
        props: () => this.props,
        sync: () => {
          this.sync();
        },
        suppressClick: () => {
          this.suppressUntil = Date.now() + 120;
        },
        canClick: () => Date.now() > this.suppressUntil,
        dragFocus: (id) => {
          this.focusMotion?.focus(this.props.data, id, this.pins, this.reduced);
          this.props.onFocusNode?.(id);
        },
        dragMove: () => {
          this.focusMotion?.wake();
        },
        stopFocus: () => {
          this.focusMotion?.stop();
        },
        releaseFocus: () => {
          this.focusMotion?.release();
        }
      });
      await graph.render();
      if (!this.active(graph)) return;
      if (this.props.data.nodes.length > 0) await this.fitOnce(graph);
      if (!this.active(graph)) return;
      this.ready = true;
      this.applyBehaviors();
      this.sync();
      this.feedback.ready(true);
      const latestStructure = topologyKey(this.props.data);
      if (this.structure !== latestStructure) {
        this.structure = latestStructure;
        this.reflow();
      }
    } catch (error: unknown) {
      if (this.alive) console.error("Graph visualization initialization failed", error);
    }
  }

  unmount() {
    this.alive = false;
    this.ready = false;
    this.surface = null;
    this.generation++;
    this.unbindEvents?.();
    this.unbindEvents = null;
    if (this.focusFrame !== null) cancelAnimationFrame(this.focusFrame);
    this.focusFrame = null;
    this.focusMotion?.stop();
    this.focusMotion = null;
    this.pinch?.detach();
    this.pinch = null;
    this.focusScales.clear();
    const graph = this.graph;
    this.graph = null;
    graph?.stopLayout();
    graph?.destroy();
  }

  private active(graph: G6Graph): boolean {
    return this.alive && this.graph === graph && !graph.destroyed;
  }

  resizeCanvas() {
    const graph = this.graph;
    if (graph !== null && this.ready && this.active(graph)) graph.resize();
  }

  private async fitOnce(graph: G6Graph) {
    if (this.fitted || !this.active(graph)) return;
    this.fitted = true;
    // A large graph is a navigable world, not a thumbnail squeezed to fit.
    // Do not focus an element that may still be pending installation in G6.
    if (this.props.data.nodes.length > 12) return;
    await graph.fitView(undefined, false);
    // Tiny result sets otherwise zoom to 300%, hiding their caption/targets
    // under the fixed search bar or bottom-right controls.
    if (this.active(graph) && graph.getZoom() > 1.35) await graph.zoomTo(1.35, false);
  }

  syncAccessibleNodes() {
    this.sync();
  }

  private sync() {
    // G6 emits layout/draw events during the first render, before it creates
    // the viewport. getZoom() is not safe until render() has completed.
    if (!this.ready) return;
    const graph = this.graph;
    if (graph === null || !this.active(graph) || this.surface === null) return;
    syncKeyboard(graph, this.surface);
    this.feedback.scale(graph.getZoom());
    this.scheduleCenterFocus();
  }

  private scheduleCenterFocus() {
    const graph = this.graph;
    const surface = this.surface;
    if (
      !this.ready ||
      // Resizing nodes while G6 is running d3-force can prevent the
      // simulation's render promise from resolving.
      this.reflowPending ||
      graph === null ||
      surface === null ||
      this.focusFrame !== null ||
      typeof requestAnimationFrame !== "function"
    )
      return;
    this.focusFrame = requestAnimationFrame(() => {
      this.focusFrame = null;
      if (!this.active(graph) || this.surface !== surface || this.reflowPending) return;
      const { width, height } = surface.getBoundingClientRect();
      const changes: { id: string; style: ReturnType<typeof centerFocusStyle> }[] = [];
      for (const node of this.props.data.nodes) {
        try {
          const rendered = graph.getElementRenderStyle(node.id);
          const position = graph.getElementPosition(node.id);
          const x = typeof rendered["x"] === "number" ? rendered["x"] : position[0];
          const y = typeof rendered["y"] === "number" ? rendered["y"] : position[1];
          const screen = graph.getViewportByCanvas([x, y]);
          const scale = centerFocusScale(screen[0], screen[1], width, height);
          if (Math.abs((this.focusScales.get(node.id) ?? -1) - scale) < 0.02) continue;
          this.focusScales.set(node.id, scale);
          changes.push({ id: node.id, style: centerFocusStyle(scale) });
        } catch {
          // A concurrent graph update may have removed this node.
        }
      }
      if (changes.length === 0) return;
      graph.updateNodeData(changes);
      void graph.draw();
    });
  }

  private updatePins(value: Set<string>) {
    this.pins = value;
    this.pinStatesDirty = true;
    this.feedback.pins(value);
    this.props.onPinnedChange?.(value);
  }

  setProps(props: GraphSceneProps) {
    const previous = this.props;
    const disabledChanged = (previous.disabled === true) !== (props.disabled === true);
    const attentionChanged =
      (previous.highlighted ?? previous.selected) !== (props.highlighted ?? props.selected);
    const presentationChanged =
      previous.data !== props.data ||
      previous.selected !== props.selected ||
      previous.expanded !== props.expanded ||
      previous.expandingIds !== props.expandingIds ||
      attentionChanged ||
      this.pinStatesDirty;
    this.props = props;
    const graph = this.graph;
    if (!this.ready || graph === null || !this.active(graph)) return;
    const key = topologyKey(props.data);
    if (key !== this.structure) {
      this.structure = key;
      this.reflow();
    } else if (!this.reflowPending && presentationChanged) {
      // A sidebar-only React rerender must not redraw G6; changed selection
      // and pin state still update without restarting the physical layout.
      this.pinStatesDirty = false;
      if (attentionChanged) {
        const focus = props.highlighted ?? props.selected ?? null;
        if (this.focusMotion?.activeFocusId !== focus) this.focusMotion?.stop();
        updateGraphLabels(graph, props.data, focus);
      }
      void graph.setElementState(elementStates(graph, props, this.pins), false);
      if (attentionChanged) void graph.draw();
    }
    if (disabledChanged) this.applyBehaviors();
  }

  setReduced(value: boolean) {
    if (this.reduced === value) return;
    this.reduced = value;
    const graph = this.graph;
    if (graph === null || !this.active(graph)) return;
    graph.setLayout(
      forceLayout(
        value,
        this.props.data.nodes.map((node) => node.id)
      )
    );
    if (value) graph.stopLayout();
    const activeFocus = this.focusMotion?.activeFocusId ?? null;
    this.focusMotion?.stop();
    if (activeFocus !== null)
      this.focusMotion?.focus(this.props.data, activeFocus, this.pins, value);
    this.applyBehaviors();
  }

  private applyBehaviors() {
    const graph = this.graph;
    if (graph === null || !this.active(graph)) return;
    const changed = () => {
      if (this.active(graph)) this.feedback.scale(graph.getZoom());
    };
    graph.setBehaviors(
      this.props.disabled === true
        ? []
        : graphBehaviors(changed, () => {
            this.pinch?.align();
            changed();
          })
    );
  }

  reflow(restart = false) {
    const graph = this.graph;
    if (graph === null || !this.active(graph) || this.surface === null) return;
    this.reflowPending = true;
    this.focusMotion?.stop();
    if (this.focusFrame !== null) cancelAnimationFrame(this.focusFrame);
    this.focusFrame = null;
    this.feedback.ready(false);
    const generation = ++this.generation;
    this.renderQueue = this.renderQueue
      .catch(() => undefined)
      .then(async () => {
        if (!this.active(graph) || generation !== this.generation) return;
        const surface = this.surface;
        if (surface === null) return;
        const current = graphPositions(graph);
        const valid = new Set(this.props.data.nodes.map((node) => node.id));
        const retained = new Set([...this.pins].filter((id) => valid.has(id)));
        if (retained.size !== this.pins.size) this.updatePins(retained);
        const original = new Map([...current].filter(([id]) => valid.has(id)));
        const around = restart
          ? new Map<string, GraphPoint>()
          : radialNeighborPositions(this.props.data, original, this.props.expanded ?? EMPTY_IDS);
        const previous = restart
          ? new Map([...original].filter(([id]) => retained.has(id)))
          : new Map([...original, ...around]);
        this.focusScales.clear();
        graph.setLayout(
          forceLayout(
            this.reduced || (!restart && original.size > 0),
            this.props.data.nodes.map((node) => node.id)
          )
        );
        graph.setData(
          graphToG6({
            data: this.props.data,
            previous,
            pinned: retained,
            selected: this.props.highlighted ?? this.props.selected ?? null,
            expanded: this.props.expanded ?? EMPTY_IDS,
            expanding: this.props.expandingIds ?? EMPTY_IDS,
            palette: graphPalette(surface)
          })
        );
        await graph.render();
        if (!this.active(graph)) return;
        // Topology changes must not move existing visible nodes. New nodes
        // occupy rings around the real queried origin after layout settles.
        // Explicit Arrange still lets non-pinned nodes move.
        const stable = restart
          ? new Map([...original].filter(([id]) => retained.has(id)))
          : new Map([...original, ...around]);
        const restore = [...stable].map(([id, pos]) => ({
          id,
          style: { x: pos.x, y: pos.y }
        }));
        if (restore.length > 0) {
          graph.updateNodeData(restore);
          await graph.draw();
        }
        if (!this.active(graph)) return;
        await this.fitOnce(graph);
        await graph.setElementState(elementStates(graph, this.props, this.pins), false);
        this.sync();
      })
      .catch((error: unknown) => {
        if (this.active(graph)) console.error("Graph layout failed", error);
      })
      .finally(() => {
        if (generation === this.generation) {
          this.reflowPending = false;
          if (this.active(graph)) {
            this.sync();
            this.feedback.ready(true);
          }
        }
      });
  }

  refreshColors() {
    const graph = this.graph;
    if (graph === null || !this.active(graph) || this.surface === null) return;
    this.focusScales.clear();
    graph.setData(
      graphToG6({
        data: this.props.data,
        previous: graphPositions(graph),
        pinned: this.pins,
        selected: this.props.highlighted ?? this.props.selected ?? null,
        expanded: this.props.expanded ?? EMPTY_IDS,
        expanding: this.props.expandingIds ?? EMPTY_IDS,
        palette: graphPalette(this.surface)
      })
    );
    void graph.draw();
  }

  togglePin(id: string, move?: GraphPoint) {
    const graph = this.graph;
    if (
      graph === null ||
      !this.active(graph) ||
      !this.props.data.nodes.some((node) => node.id === id)
    )
      return;
    const next = new Set(this.pins);
    if (move === undefined && next.has(id)) next.delete(id);
    else next.add(id);
    if (move !== undefined) {
      const current = graph.getElementPosition(id);
      const x = current[0] + move.x;
      const y = current[1] + move.y;
      graph.updateNodeData([{ id, style: { x, y, fx: x, fy: y } }]);
    }
    this.updatePins(next);
    this.reflow();
  }

  focusNode(id: string) {
    const graph = this.graph;
    if (this.props.disabled === true || graph === null || !this.active(graph)) return;
    void graph.focusElement(id, { duration: this.reduced ? 0 : 200 });
    const proxy = [...(this.surface?.querySelectorAll<HTMLElement>("[data-graph-id]") ?? [])].find(
      (element) => element.dataset["graphId"] === id
    );
    proxy?.focus({ preventScroll: true });
  }

  focusState(id: string, focused: boolean) {
    const graph = this.graph;
    if (graph === null || !this.active(graph) || this.reflowPending) return;
    const states = graph.getElementState(id).filter((value) => value !== "focused");
    if (focused) states.push("focused");
    void graph.setElementState(id, states, false);
  }

  fit() {
    const graph = this.graph;
    if (graph !== null && this.active(graph) && this.props.disabled !== true)
      void graph.fitView(undefined, this.reduced ? false : { duration: 220 });
  }

  zoomBy(factor: number) {
    const graph = this.graph;
    if (graph !== null && this.active(graph) && this.props.disabled !== true) zoomG6(graph, factor);
  }

  resetZoom() {
    const graph = this.graph;
    if (graph !== null && this.active(graph) && this.props.disabled !== true)
      void graph.zoomTo(1, false);
  }

  private keyboardMenu(event: KeyboardEvent<HTMLElement>, id: string | null, graph: G6Graph) {
    event.preventDefault();
    event.stopPropagation();
    if (this.surface !== null) this.props.onContextMenu?.(contextPosition(graph, this.surface, id));
  }

  private elementKey(event: KeyboardEvent<HTMLElement>, id: string, graph: G6Graph) {
    if (id.startsWith("n:") && event.shiftKey && event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      this.props.onToggleExpand?.(id);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      this.props.onSelect(id);
      return;
    }
    const delta = keyStep(event.key);
    if (delta === null) return;
    event.preventDefault();
    event.stopPropagation();
    if (id.startsWith("n:")) this.togglePin(id, delta);
    else void graph.translateBy([-delta.x, -delta.y], false);
  }

  private canvasKey(event: KeyboardEvent<HTMLElement>, graph: G6Graph) {
    const delta = keyStep(event.key);
    if (delta !== null) {
      event.preventDefault();
      event.stopPropagation();
      void graph.translateBy([-delta.x, -delta.y], false);
      return;
    }
    if (event.key === "f" || event.key === "0") {
      event.preventDefault();
      this.fit();
    } else if (["+", "=", "-", "−"].includes(event.key)) {
      event.preventDefault();
      const factor = event.key === "-" || event.key === "−" ? 1 / 1.2 : 1.2;
      this.zoomBy(factor);
    }
  }

  handleKey(event: KeyboardEvent<HTMLElement>, id: string | null) {
    const graph = this.graph;
    if (
      this.props.disabled === true ||
      graph === null ||
      !this.active(graph) ||
      event.nativeEvent.isComposing
    )
      return;
    if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      this.keyboardMenu(event, id, graph);
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (id === null) this.canvasKey(event, graph);
    else this.elementKey(event, id, graph);
  }
}
