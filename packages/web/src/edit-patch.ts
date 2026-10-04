import { type ObjectKind } from "@kgos/sdk";

import { yamlString } from "./edit-yaml.js";

export interface DraftEntry {
  ref: string;
  kind: ObjectKind;
  base: string;
  body: string;
  deleted: boolean;
}

export const OBJECT_KINDS: ObjectKind[] = [
  "knowledge-node",
  "knowledge-relationship",
  "domain",
  "node-definition",
  "relationship-definition"
];

export const KIND_LABELS: Record<ObjectKind, string> = {
  "knowledge-node": "节点",
  "knowledge-relationship": "关系",
  domain: "领域",
  "node-definition": "节点定义",
  "relationship-definition": "关系定义"
};

export function refComponent(name: string): string {
  return encodeURIComponent(name).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

export function newRef(kind: ObjectKind, alias: string): string {
  let control = false;
  for (let index = 0; index < alias.length; index += 1) {
    if (alias.charCodeAt(index) < 32 || alias.charCodeAt(index) === 127) control = true;
  }
  if (alias === "" || new TextEncoder().encode(alias).length > 255 || control) {
    throw new Error("alias 必须是 1..255 UTF-8 bytes，且不含控制字符");
  }
  return `new:${kind}:${refComponent(alias)}`;
}

export function blankBody(kind: ObjectKind): string {
  switch (kind) {
    case "knowledge-node":
      return "labels: []\nproperties: {}\n";
    case "knowledge-relationship":
      return 'type: ""\nstart: ""\nend: ""\nproperties: {}\n';
    case "domain":
      return 'name: ""\nincludes: []\n';
    case "node-definition":
      return 'name: ""\nproperties: []\nconstraints: []\n';
    case "relationship-definition":
      return 'name: ""\nfrom: null\nto: null\nproperties: []\nconstraints: []\n';
  }
}

export function targetRef(entry: DraftEntry): string {
  if (entry.ref.startsWith("new:") || entry.kind.startsWith("knowledge-") || entry.deleted)
    return entry.ref;
  const name = yamlString(entry.body, ["name"]);
  const prefix = entry.ref.slice(0, entry.ref.indexOf(":"));
  return `${prefix}:${refComponent(name)}`;
}

function patchLines(body: string, prefix: string): { text: string; count: number } {
  if (body === "") return { text: "", count: 0 };
  const lines = body.split("\n");
  const newline = lines.at(-1) === "";
  if (newline) lines.pop();
  const text = lines.map((line) => `${prefix}${line}\n`).join("");
  return { text: text + (newline ? "" : "\\ No newline at end of file\n"), count: lines.length };
}

export function entryPatch(entry: DraftEntry): string {
  const target = targetRef(entry);
  let metadata = "";
  let oldFile = `a/${entry.ref}`;
  let newFile = `b/${target}`;
  if (entry.ref.startsWith("new:")) {
    metadata = "new file mode 100644\n";
    oldFile = "/dev/null";
  } else if (entry.deleted) {
    metadata = "deleted file mode 100644\n";
    newFile = "/dev/null";
  } else if (target !== entry.ref) metadata = `rename from ${entry.ref}\nrename to ${target}\n`;
  const old = patchLines(entry.base, "-");
  const next = patchLines(entry.deleted ? "" : entry.body, "+");
  const header = `@@ -${old.count === 0 ? "0" : "1"},${String(old.count)} +${next.count === 0 ? "0" : "1"},${String(next.count)} @@\n`;
  return `diff --git a/${entry.ref} b/${target}\n${metadata}--- ${oldFile}\n+++ ${newFile}\n${header}${old.text}${next.text}`;
}

export function objectPatch(entries: DraftEntry[]): string {
  return entries.map(entryPatch).join("");
}
