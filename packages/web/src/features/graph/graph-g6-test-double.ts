export const graphs: unknown[] = [];

export class FakeG6Graph {
  destroyed = false;
  options: Record<string, unknown>;
  data: {
    nodes?: { id: string; style?: { x?: number; y?: number } }[];
    edges?: { id: string; source: string; target: string }[];
  };
  zoom = 1;
  events = new Map<string, ((event: unknown) => void)[]>();
  behaviors: unknown[] = [];
  states = new Map<string, string[]>();
  getElementState(id: string) {
    return this.states.get(id) ?? [];
  }
  calls: string[] = [];
  constructor(options: Record<string, unknown>) {
    this.options = options;
    this.data = options["data"] as typeof this.data;
    graphs.push(this);
  }
  on(event: string, callback: (event: unknown) => void) {
    this.events.set(event, [...(this.events.get(event) ?? []), callback]);
  }
  off(event: string, callback: (event: unknown) => void) {
    this.events.set(
      event,
      (this.events.get(event) ?? []).filter((handler) => handler !== callback)
    );
  }
  emit(event: string, value: unknown = {}) {
    for (const callback of this.events.get(event) ?? []) callback(value);
  }
  getNodeData(): typeof this.data.nodes {
    return this.data.nodes ?? [];
  }
  getElementPosition(id: string) {
    const node = this.data.nodes?.find((entry) => entry.id === id);
    return [node?.style?.x ?? 0, node?.style?.y ?? 0];
  }
  getElementRenderStyle(id: string) {
    const node = this.data.nodes?.find((entry) => entry.id === id);
    return node?.style ?? {};
  }
  getViewportByCanvas(point: [number, number]) {
    return point;
  }
  getZoom() {
    return this.zoom;
  }
  setData(data: typeof this.data) {
    this.data = data;
    this.calls.push("data");
  }
  setLayout(layout: unknown) {
    this.options["layout"] = layout;
    this.calls.push("layout");
  }
  render() {
    this.calls.push("render");
    return Promise.resolve();
  }
  draw() {
    this.calls.push("draw");
    return Promise.resolve();
  }
  setElementState(value: string | Record<string, string[]>, states?: string[]) {
    this.calls.push("states");
    if (typeof value === "string") this.states.set(value, states ?? []);
    else for (const [id, current] of Object.entries(value)) this.states.set(id, current);
    return Promise.resolve();
  }
  setBehaviors(value: unknown[]) {
    this.behaviors = value;
  }
  updateNodeData(value: { id: string; style: { x: number; y: number } }[]) {
    for (const update of value) {
      const node = this.data.nodes?.find((entry) => entry.id === update.id);
      if (node !== undefined) node.style = { ...node.style, ...update.style };
    }
  }
  zoomTo(value: number) {
    this.zoom = value;
    return Promise.resolve();
  }
  fitView() {
    this.calls.push("fit");
    return Promise.resolve();
  }
  focusElement(id: string) {
    this.calls.push("focus:" + id);
    return Promise.resolve();
  }
  translateBy() {
    this.calls.push("translate");
    return Promise.resolve();
  }
  stopLayout() {
    this.calls.push("stop");
  }
  destroy() {
    this.destroyed = true;
    this.calls.push("destroy");
  }
}
