import { type JsonObject, type ObjectKind, type PatchResult } from "@kgos/sdk";

import { isObject, textField } from "./json.js";
import { type DraftEntry, OBJECT_KINDS } from "./edit-patch.js";

type DraftStatus = "editing" | "pending" | "unknown" | "committed";
export interface ObjectDraftData {
  baseState: string;
  branch: string;
  entries: DraftEntry[];
  inputs: Record<string, string>;
  status: DraftStatus;
  patch: string;
  receipt: PatchResult | undefined;
}

function objectKind(value: unknown): value is ObjectKind {
  return OBJECT_KINDS.some((kind) => kind === value);
}

function entryData(value: unknown): DraftEntry {
  if (
    !isObject(value) ||
    !objectKind(value["kind"]) ||
    typeof value["ref"] !== "string" ||
    typeof value["base"] !== "string" ||
    typeof value["body"] !== "string" ||
    typeof value["deleted"] !== "boolean"
  ) {
    throw new Error("草稿格式无法读取；保留 daemon 中原记录");
  }
  return {
    kind: value["kind"],
    ref: value["ref"],
    base: value["base"],
    body: value["body"],
    deleted: value["deleted"]
  };
}

function readReceipt(value: unknown): PatchResult | undefined {
  if (value === undefined || value === null) return undefined;
  if (
    !isObject(value) ||
    typeof value["state"] !== "string" ||
    !Array.isArray(value["created"]) ||
    !Array.isArray(value["transitions"])
  ) {
    throw new Error("已保存回执格式无法读取；不重新发送 Patch");
  }
  const created = value["created"].map((item) => {
    if (
      !isObject(item) ||
      !objectKind(item["kind"]) ||
      typeof item["alias"] !== "string" ||
      typeof item["ref"] !== "string"
    ) {
      throw new Error("新增 alias 回执无效；不猜测正式 Ref");
    }
    return { kind: item["kind"], alias: item["alias"], ref: item["ref"] };
  });
  const transitions = value["transitions"].map((item) => {
    if (!isObject(item) || typeof item["from"] !== "string" || typeof item["to"] !== "string")
      throw new Error("Ref transition 回执无效");
    return { from: item["from"], to: item["to"] };
  });
  return { state: value["state"], created, transitions };
}

export function readDraft(data: JsonObject): ObjectDraftData {
  if (data["version"] !== 1 || data["subtype"] !== "object" || !Array.isArray(data["entries"])) {
    throw new Error("该记录不是可读取的 v1 Object 草稿");
  }
  const baseState = textField(data, "baseState");
  const branch = textField(data, "branch");
  if (!/^commit\/[a-f0-9]{64}$/.test(baseState) || branch === "")
    throw new Error("草稿缺少明确 Branch / immutable baseState");
  const rawStatus = textField(data, "status", "editing");
  let status: DraftStatus = "unknown";
  if (rawStatus === "committed") status = "committed";
  if (rawStatus === "editing") status = "editing";
  const inputs: Record<string, string> = {};
  if (isObject(data["inputs"])) {
    for (const [key, value] of Object.entries(data["inputs"])) {
      if (typeof value !== "string") throw new Error("草稿输入格式无法读取");
      inputs[key] = value;
    }
  }
  return {
    baseState,
    branch,
    status,
    entries: data["entries"].map(entryData),
    inputs,
    patch: textField(data, "patch"),
    receipt: readReceipt(data["receipt"])
  };
}

export function draftData(data: ObjectDraftData): JsonObject {
  return {
    version: 1,
    subtype: "object",
    baseState: data.baseState,
    branch: data.branch,
    status: data.status,
    patch: data.patch,
    inputs: data.inputs,
    entries: data.entries.map((entry) => ({ ...entry })),
    receipt:
      data.receipt === undefined
        ? null
        : {
            state: data.receipt.state,
            created: data.receipt.created.map((created) => ({ ...created })),
            transitions: data.receipt.transitions.map((transition) => ({ ...transition }))
          }
  };
}
