import { type JsonObject, type JsonValue } from "@kgos/sdk";

import { isObject, stableJSON } from "./json.js";

export const PROJECTION_LIMITS = { nodes: 1_000, relationships: 2_000, values: 100_000, depth: 64 };

interface GraphNode {
  kind: "node";
  ref: string;
  labels: string[];
  properties: JsonObject;
  loaded: boolean;
}

export interface GraphRelationship {
  kind: "relationship";
  ref: string;
  type: string;
  start: string;
  end: string;
  properties: JsonObject;
}

export type GraphElement = GraphNode | GraphRelationship;
export interface Projection {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
  limited: boolean;
  issues: string[];
}

function strings(value: JsonValue | undefined): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function node(value: JsonObject): GraphNode | undefined {
  if (
    typeof value["elementId"] !== "string" ||
    !/^n:(?:0|[1-9]\d*)$/.test(value["elementId"]) ||
    !strings(value["labels"]) ||
    !isObject(value["properties"])
  )
    return undefined;
  return {
    kind: "node",
    ref: value["elementId"],
    labels: value["labels"],
    properties: value["properties"],
    loaded: true
  };
}

function relationship(value: JsonObject): GraphRelationship | undefined {
  if (
    typeof value["elementId"] !== "string" ||
    !/^r:(?:0|[1-9]\d*)$/.test(value["elementId"]) ||
    typeof value["type"] !== "string" ||
    typeof value["start"] !== "string" ||
    typeof value["end"] !== "string" ||
    !/^n:(?:0|[1-9]\d*)$/.test(value["start"]) ||
    !/^n:(?:0|[1-9]\d*)$/.test(value["end"]) ||
    !isObject(value["properties"])
  )
    return undefined;
  return {
    kind: "relationship",
    ref: value["elementId"],
    type: value["type"],
    start: value["start"],
    end: value["end"],
    properties: value["properties"]
  };
}

class Builder {
  readonly nodes = new Map<string, GraphNode>();
  readonly relationships = new Map<string, GraphRelationship>();
  readonly blocked = new Set<string>();
  readonly issues: string[] = [];
  limited = false;

  add(element: GraphElement) {
    if (this.blocked.has(element.ref)) return;
    if (element.kind === "node") {
      const previous = this.nodes.get(element.ref);
      if (
        previous?.loaded === true &&
        stableJSON(previous.properties) + stableJSON([...previous.labels].sort()) !==
          stableJSON(element.properties) + stableJSON([...element.labels].sort())
      ) {
        this.inconsistent(element.ref);
      } else if (previous !== undefined || this.nodes.size < PROJECTION_LIMITS.nodes)
        this.nodes.set(element.ref, element);
      else this.limited = true;
      return;
    }
    const previous = this.relationships.get(element.ref);
    if (previous !== undefined && stableJSON({ ...previous }) !== stableJSON({ ...element })) {
      this.inconsistent(element.ref);
      return;
    }
    if (this.relationships.size >= PROJECTION_LIMITS.relationships && previous === undefined) {
      this.limited = true;
      return;
    }
    this.endpoint(element.start);
    this.endpoint(element.end);
    if (this.nodes.has(element.start) && this.nodes.has(element.end))
      this.relationships.set(element.ref, element);
    else this.limited = true;
  }

  private inconsistent(ref: string) {
    this.nodes.delete(ref);
    this.relationships.delete(ref);
    for (const [key, edge] of this.relationships)
      if (edge.start === ref || edge.end === ref) this.relationships.delete(key);
    this.blocked.add(ref);
    this.issues.push(`${ref} 返回了不一致内容，请查看 JSON 并在明确 State 重新读取`);
  }

  private endpoint(ref: string) {
    if (this.nodes.has(ref) || this.blocked.has(ref)) return;
    if (this.nodes.size >= PROJECTION_LIMITS.nodes) {
      this.limited = true;
      return;
    }
    this.nodes.set(ref, { kind: "node", ref, labels: [], properties: {}, loaded: false });
  }

  visit(value: JsonValue): JsonValue[] {
    if (Array.isArray(value)) return value;
    if (!isObject(value)) return [];
    const tag = value["$type"];
    if (tag === "Node" || tag === "Relationship") {
      const element = tag === "Node" ? node(value) : relationship(value);
      if (element === undefined && this.issues.length < 20)
        this.issues.push("无法解释的 typed 图值，请查看原始 JSON");
      else if (element !== undefined) this.add(element);
      return [];
    }
    if (tag === "Path") return [value["nodes"] ?? null, value["relationships"] ?? null];
    if (tag === "Map") return isObject(value["entries"]) ? Object.values(value["entries"]) : [];
    return tag === undefined ? Object.values(value) : [];
  }
}

export function project(rows: JsonValue[][]): Projection {
  const builder = new Builder();
  const stack: { value: JsonValue; depth: number }[] = [{ value: rows, depth: 0 }];
  let visited = 0;
  while (stack.length !== 0) {
    const entry = stack.pop();
    if (entry === undefined) break;
    visited += 1;
    if (visited > PROJECTION_LIMITS.values) {
      builder.limited = true;
      break;
    }
    if (entry.depth > PROJECTION_LIMITS.depth) {
      builder.limited = true;
      continue;
    }
    const children = builder.visit(entry.value);
    const remaining = PROJECTION_LIMITS.values - visited - stack.length;
    if (children.length > remaining) builder.limited = true;
    for (let index = Math.min(children.length, remaining) - 1; index >= 0; index -= 1) {
      const value = children[index];
      if (value !== undefined) stack.push({ value, depth: entry.depth + 1 });
    }
  }
  return {
    nodes: [...builder.nodes.values()],
    relationships: [...builder.relationships.values()].filter(
      (edge) => !builder.blocked.has(edge.start) && !builder.blocked.has(edge.end)
    ),
    limited: builder.limited,
    issues: builder.issues
  };
}

export function elementTitle(element: GraphElement): string {
  if (element.kind === "relationship") return element.type;
  for (const key of ["title", "name", "label"]) {
    const value = element.properties[key];
    if (typeof value === "string" && value.length !== 0) return value;
  }
  return element.loaded ? element.ref : `${element.ref} · 未加载`;
}
