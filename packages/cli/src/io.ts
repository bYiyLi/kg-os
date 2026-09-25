import { readFile } from "node:fs/promises";

import type { JsonObject, JsonValue } from "@kgos/sdk";

import { localIOError, parseError, resourceError, usageError } from "./errors.js";

const MAX_INPUT_BYTES = 16 << 20;

export async function readTextFile(path: string, label: string): Promise<string> {
  let body: Buffer;
  try {
    body = await readFile(path);
  } catch {
    throw localIOError("read " + label + " failed");
  }
  if (body.byteLength > MAX_INPUT_BYTES) {
    throw resourceError(label + " exceeds resource limit");
  }
  return decodeUTF8(body, label);
}

export async function readStdin(label: string): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buffer.byteLength;
    if (total > MAX_INPUT_BYTES) {
      throw resourceError(label + " exceeds resource limit");
    }
    chunks.push(buffer);
  }
  return decodeUTF8(Buffer.concat(chunks), label);
}

function decodeUTF8(body: Buffer, label: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw parseError(label + " is not valid UTF-8 text");
  }
}

export function parseJSON(text: string, label: string): JsonValue {
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    throw parseError(label + " must be valid JSON");
  }
}

export function parseJSONObject(text: string, label: string): JsonObject {
  const value = parseJSON(text, label);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw usageError(label + " must be a JSON object");
  }
  return value;
}

export function outputJSON(value: unknown, pretty: boolean): void {
  process.stdout.write(JSON.stringify(value, null, pretty ? 2 : 0) + "\n");
}

export function requireNonEmptyText(text: string, label: string): string {
  if (text.length === 0) {
    throw usageError(label + " is empty");
  }
  return text;
}
