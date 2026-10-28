import type { JsonObject, JsonValue } from "@kgos/sdk";

export interface GraphNode {
  id: string;
  labels: string[];
  properties: JsonObject;
}

export interface GraphRelationship {
  id: string;
  type: string;
  start: string;
  end: string;
  properties: JsonObject;
}

export interface GraphData {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
  limited: boolean;
}

const GRAPH_NODE_LIMIT = 200;
const GRAPH_RELATIONSHIP_LIMIT = 400;

export function emptyGraph(): GraphData {
  return { nodes: [], relationships: [], limited: false };
}

function invalidGraph(): never {
  throw new Error("Invalid graph response");
}

function objectValue(value: unknown): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalidGraph();
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  let visited = 0;
  while (pending.length > 0) {
    const item = pending.pop();
    if (item === undefined) break;
    if (++visited > 100_000 || item.depth > 64) invalidGraph();
    if (typeof item.value !== "object" || item.value === null) continue;
    const children: unknown[] = Object.values(item.value);
    if (children.length + pending.length > 100_000) invalidGraph();
    for (const child of children) pending.push({ value: child, depth: item.depth + 1 });
  }
  return value as JsonObject;
}

function identity(value: unknown, prefix: "n:" | "r:"): string {
  if (typeof value !== "string" || !value.startsWith(prefix)) invalidGraph();
  const suffix = value.slice(2);
  if (!/^(?:0|[1-9][0-9]{0,19})$/.test(suffix) || BigInt(suffix) > 18446744073709551615n)
    invalidGraph();
  return value;
}

function parseNode(value: JsonObject): GraphNode {
  const labels = value["labels"];
  if (
    !Array.isArray(labels) ||
    !labels.every((item) => typeof item === "string" && item !== "") ||
    new Set(labels).size !== labels.length
  )
    invalidGraph();
  return {
    id: identity(value["elementId"], "n:"),
    labels: labels as string[],
    properties: objectValue(value["properties"])
  };
}

function parseRelationship(value: JsonObject): GraphRelationship {
  const type = value["type"];
  if (typeof type !== "string" || type === "") invalidGraph();
  return {
    id: identity(value["elementId"], "r:"),
    type,
    start: identity(value["start"], "n:"),
    end: identity(value["end"], "n:"),
    properties: objectValue(value["properties"])
  };
}

function canonical(value: unknown, depth = 0): string {
  if (depth > 70) invalidGraph();
  if (Array.isArray(value))
    return "[" + value.map((item: unknown) => canonical(item, depth + 1)).join(",") + "]";
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return (
      "{" +
      Object.keys(record)
        .sort()
        .map((key) => JSON.stringify(key) + ":" + canonical(record[key], depth + 1))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value);
}

function canonicalElement(value: GraphNode | GraphRelationship): string {
  return canonical("labels" in value ? { ...value, labels: value.labels.toSorted() } : value);
}

function append<T extends GraphNode | GraphRelationship>(
  items: Map<string, T>,
  value: T,
  limit: number
) {
  const previous = items.get(value.id);
  if (previous !== undefined) {
    if (canonicalElement(previous) !== canonicalElement(value)) invalidGraph();
    return false;
  }
  if (items.size >= limit) return true;
  items.set(value.id, value);
  return false;
}

export function mergeGraph(base: GraphData, addition: GraphData): GraphData {
  const nodes = new Map<string, GraphNode>();
  const relationships = new Map<string, GraphRelationship>();
  let limited = base.limited || addition.limited;
  for (const item of [...base.nodes, ...addition.nodes]) {
    limited = append(nodes, item, GRAPH_NODE_LIMIT) || limited;
  }
  for (const item of [...base.relationships, ...addition.relationships]) {
    if (!nodes.has(item.start) || !nodes.has(item.end)) {
      limited = true;
      continue;
    }
    limited = append(relationships, item, GRAPH_RELATIONSHIP_LIMIT) || limited;
  }
  return { nodes: [...nodes.values()], relationships: [...relationships.values()], limited };
}

interface Projection {
  nodes: Map<string, GraphNode>;
  relationships: Map<string, GraphRelationship>;
  limited: boolean;
}

function projectEntity(value: JsonObject, graph: Projection): boolean {
  if (value["$type"] === "Node") {
    graph.limited = append(graph.nodes, parseNode(value), GRAPH_NODE_LIMIT) || graph.limited;
    return true;
  }
  if (value["$type"] === "Relationship") {
    graph.limited =
      append(graph.relationships, parseRelationship(value), GRAPH_RELATIONSHIP_LIMIT) ||
      graph.limited;
    return true;
  }
  return false;
}

function appendChildren(
  values: JsonValue[],
  depth: number,
  pending: { value: JsonValue; depth: number }[]
): boolean {
  for (const child of values.toReversed()) {
    if (pending.length >= 100_000) return true;
    pending.push({ value: child, depth });
  }
  return false;
}

// Interpret only the declared Lithograph graph tags. In particular an ordinary
// business map with elementId/labels/properties is not a graph entity.
export function projectGraph(rows: JsonValue[][]): GraphData {
  const graph: Projection = { nodes: new Map(), relationships: new Map(), limited: false };
  const pending: { value: JsonValue; depth: number }[] = rows
    .flatMap((row) => row.map((value) => ({ value, depth: 0 })))
    .reverse();
  let visited = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    if (++visited > 100_000 || current.depth > 64) {
      graph.limited = true;
      break;
    }
    const value = current.value;
    if (typeof value !== "object" || value === null) continue;
    if (!Array.isArray(value) && projectEntity(value, graph)) continue;
    const values = Array.isArray(value) ? value : Object.values(value);
    graph.limited = appendChildren(values, current.depth + 1, pending) || graph.limited;
  }
  return {
    nodes: [...graph.nodes.values()],
    relationships: [...graph.relationships.values()],
    limited: graph.limited
  };
}

export function nodeCaption(node: GraphNode): string {
  const preferred = ["name", "title", "label", "summary"];
  const keys = [...new Set([...preferred, ...Object.keys(node.properties).sort()])];
  for (const key of keys) {
    const value = node.properties[key];
    if (typeof value === "string" && value.trim() !== "") {
      return Array.from(value.trim().slice(0, 160)).slice(0, 80).join("");
    }
  }
  return node.labels[0] ?? node.id;
}
