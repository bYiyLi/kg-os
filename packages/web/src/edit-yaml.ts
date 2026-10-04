import {
  isAlias,
  isMap,
  isNode,
  isScalar,
  isSeq,
  parseDocument,
  type Document,
  type Node
} from "yaml";

export const YAML_LIMITS = { bytes: 2_000_000, nodes: 100_000, depth: 64 };
export type YAMLPath = (string | number)[];

function children(node: Node | null): Node[] {
  if (isMap(node)) return node.items.flatMap((pair) => [pair.key, pair.value].filter(isNode));
  if (isSeq(node)) return node.items.filter(isNode);
  return [];
}

function boundedTree(root: Node | null) {
  const stack = [{ value: root, depth: 0 }];
  let count = 0;
  while (stack.length > 0) {
    const item = stack.pop();
    if (item === undefined) break;
    count += 1;
    if (count > YAML_LIMITS.nodes || item.depth > YAML_LIMITS.depth) {
      throw new Error("YAML 超过前端节点或深度预算；保留原文");
    }
    for (const child of children(item.value)) stack.push({ value: child, depth: item.depth + 1 });
  }
}

function finiteTree(root: unknown) {
  const stack: { value: unknown; depth: number; exit?: boolean }[] = [{ value: root, depth: 0 }];
  const active = new Set<object>();
  let count = 0;
  while (stack.length > 0) {
    const item = stack.pop();
    if (item === undefined || item.value === null || typeof item.value !== "object") continue;
    if (item.exit === true) {
      active.delete(item.value);
      continue;
    }
    count += 1;
    if (active.has(item.value)) throw new Error("YAML alias 必须有限且无循环");
    if (count > YAML_LIMITS.nodes || item.depth > YAML_LIMITS.depth)
      throw new Error("YAML alias 展开超过预算");
    active.add(item.value);
    stack.push({ value: item.value, depth: item.depth, exit: true });
    for (const value of Object.values(item.value)) stack.push({ value, depth: item.depth + 1 });
  }
}

export function yamlDocument(text: string): Document {
  if (new TextEncoder().encode(text).length > YAML_LIMITS.bytes)
    throw new Error("YAML 超过前端文本预算；保留原文");
  const document = parseDocument(text, {
    version: "1.2",
    intAsBigInt: true,
    keepSourceTokens: true
  });
  const error = document.errors[0] ?? document.warnings[0];
  if (error !== undefined) throw new Error(error.message);
  boundedTree(document.contents);
  const value: unknown = document.toJS({ maxAliasCount: 50 });
  finiteTree(value);
  return document;
}

export function yamlFormSafe(text: string): boolean {
  const stack: (Node | null)[] = [yamlDocument(text).contents];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) break;
    if (
      isAlias(node) ||
      ((isScalar(node) || isMap(node) || isSeq(node)) && node.anchor !== undefined)
    )
      return false;
    stack.push(...children(node));
  }
  return true;
}

export function yamlNode(text: string, path: YAMLPath): Node | undefined {
  const value: unknown = yamlDocument(text).getIn(path, true);
  return isNode(value) ? value : undefined;
}

export function yamlString(text: string, path: YAMLPath): string {
  const value = yamlNode(text, path);
  return isScalar(value) && typeof value.value === "string" ? value.value : "";
}

export function yamlStrings(text: string, path: YAMLPath): string[] {
  const value = yamlNode(text, path);
  if (!isSeq(value)) return [];
  return value.items.flatMap((item) =>
    isScalar(item) && typeof item.value === "string" ? [item.value] : []
  );
}

export function yamlRaw(text: string, path: YAMLPath): string {
  const node = yamlNode(text, path);
  return node === undefined ? "" : flowNode(node, text);
}

function flowNode(node: Node | null, text: string): string {
  if (node === null) return "null";
  if (isMap(node))
    return `{${node.items
      .map((pair) => {
        if (!isScalar(pair.key) || typeof pair.key.value !== "string")
          throw new Error("字段名必须是 String");
        return `${JSON.stringify(pair.key.value)}: ${flowNode(isNode(pair.value) ? pair.value : null, text)}`;
      })
      .join(", ")}}`;
  if (isSeq(node))
    return `[${node.items.map((item) => flowNode(isNode(item) ? item : null, text)).join(", ")}]`;
  if (isScalar(node) && typeof node.value === "string") return JSON.stringify(node.value);
  if (node.range === undefined || node.range === null)
    throw new Error("该值无法无损编辑，请使用完整 YAML");
  return text.slice(node.range[0], node.range[1]).trimEnd();
}

function fragment(text: string): string {
  const document = yamlDocument(text);
  if (isAlias(document.contents)) throw new Error("字段片段不可引用其它文档的 alias");
  return flowNode(document.contents, text);
}

function replaceNode(text: string, node: Node, replacement: string): string {
  if (node.range === undefined || node.range === null || isAlias(node))
    throw new Error("该值无法无损编辑，请使用完整 YAML");
  const original = text.slice(node.range[0], node.range[1]);
  const suffix = original.endsWith("\n") ? "\n" : "";
  return text.slice(0, node.range[0]) + replacement + suffix + text.slice(node.range[1]);
}

export function setYamlRaw(text: string, path: YAMLPath, raw: string): string {
  const document = yamlDocument(text);
  const node: unknown = document.getIn(path, true);
  const replacement = fragment(raw);
  if (isNode(node)) return replaceNode(text, node, replacement);
  const parent: unknown = document.getIn(path.slice(0, -1), true);
  const key = path.at(-1);
  if (!isMap(parent) || typeof key !== "string") throw new Error("无法定位字段");
  const entries = parent.items.map((pair) => {
    if (!isScalar(pair.key)) throw new Error("无法定位字段名");
    return `${JSON.stringify(pair.key.value)}: ${flowNode(isNode(pair.value) ? pair.value : null, text)}`;
  });
  entries.push(`${JSON.stringify(key)}: ${replacement}`);
  return replaceNode(text, parent, `{${entries.join(", ")}}`);
}

export function setYamlValue(
  text: string,
  path: YAMLPath,
  value: string | boolean | null | string[]
): string {
  return setYamlRaw(text, path, JSON.stringify(value));
}

export function removeYaml(text: string, path: YAMLPath): string {
  const parent = yamlNode(text, path.slice(0, -1));
  const key = path.at(-1);
  if (isMap(parent)) {
    const remaining = parent.items.filter(
      (pair) => !(isScalar(pair.key) && pair.key.value === key)
    );
    const contents = remaining.map((pair) => {
      if (!isScalar(pair.key)) throw new Error("无法定位字段名");
      return `${JSON.stringify(pair.key.value)}: ${flowNode(isNode(pair.value) ? pair.value : null, text)}`;
    });
    return replaceNode(text, parent, `{${contents.join(", ")}}`);
  }
  if (isSeq(parent) && typeof key === "number") {
    const contents = parent.items
      .filter((_, index) => index !== key)
      .map((item) => flowNode(isNode(item) ? item : null, text));
    return replaceNode(text, parent, `[${contents.join(", ")}]`);
  }
  throw new Error("无法移除字段");
}

export function appendYaml(text: string, path: YAMLPath, raw: string): string {
  const parent = yamlNode(text, path);
  if (!isSeq(parent)) throw new Error("该字段不是列表");
  const values = parent.items.map((item) => flowNode(isNode(item) ? item : null, text));
  values.push(fragment(raw));
  return replaceNode(text, parent, `[${values.join(", ")}]`);
}

export function yamlKeys(text: string, path: YAMLPath): string[] {
  const map = yamlNode(text, path);
  if (!isMap(map)) return [];
  return map.items.flatMap((pair) =>
    isScalar(pair.key) && typeof pair.key.value === "string" ? [pair.key.value] : []
  );
}

export function renameYamlKey(text: string, path: YAMLPath, name: string): string {
  const parent = yamlNode(text, path.slice(0, -1));
  if (!isMap(parent)) throw new Error("无法定位 Property mapping");
  const key = path.at(-1);
  if (parent.items.some((pair) => isScalar(pair.key) && pair.key.value === name && name !== key))
    throw new Error("Property key 已存在");
  const pair = parent.items.find((pair) => isScalar(pair.key) && pair.key.value === key);
  if (!isScalar(pair?.key)) throw new Error("无法定位 Property key");
  return replaceNode(text, pair.key, JSON.stringify(name));
}
