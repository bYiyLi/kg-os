import { ExecutionError } from "./sandbox.js";

export const MAX_VIEW_BYTES = 32 * 1024 * 1024;

export function utf8Sort(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

export function navigation(value: string): string {
  // One pass prevents a second escape from corrupting an HTML entity's '#'.
  return value.replace(/[&<>|`\\\r\n*_[\]#!]/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "|":
        return "&#124;";
      case "`":
        return "&#96;";
      case "\\":
        return "&#92;";
      case "\r":
        return "&#13;";
      case "\n":
        return "&#10;";
      default:
        return "\\" + character;
    }
  });
}

export function mermaidLabel(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\r", "&#13;")
    .replaceAll("\n", "&#10;")
    .replaceAll("`", "&#96;");
}

export function fenced(
  lines: string[],
  content: string,
  language: "markdown" | "mermaid" | "yaml"
): void {
  const longest = Math.max(2, ...Array.from(content.matchAll(/`+/g), (match) => match[0].length));
  const fence = "`".repeat(longest + 1);
  lines.push(fence + language);
  if (content.length !== 0) {
    const body = content.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
    const split = body.split("\n");
    if (body.endsWith("\n")) split.pop();
    lines.push(...split);
  }
  lines.push(fence);
}

export function commitMessage(lines: string[], message?: string): void {
  if (message === undefined) {
    lines.push("（无 Message）");
  } else {
    fenced(lines, message, "markdown");
  }
}

export function summaryFromMessage(message?: string): string {
  if (message === undefined) return "无规范简介";
  const normalized = message.replaceAll("\r\n", "\n").split("\n");
  let start = -1;
  let end = -1;
  for (let index = 0; index < normalized.length; index++) {
    if (normalized[index] === "## 简介" && start === -1) start = index;
    if (normalized[index] === "## 改动" && start !== -1) {
      end = index;
      break;
    }
  }
  if (start === -1 || end <= start + 1) return "无规范简介";
  return normalized.slice(start + 1, end).find((line) => line.trim().length !== 0) ?? "无规范简介";
}

/** Build final LF text, resolving absolute windows only after all sections exist. */
export class MarkdownDocument {
  readonly lines: string[] = [];
  private readonly anchors = new Map<number, { start?: number; end?: number }>();
  private nextId = 0;

  reserve(): number {
    const id = ++this.nextId;
    this.anchors.set(id, {});
    return id;
  }

  begin(id: number): void {
    const anchor = this.anchors.get(id);
    if (anchor === undefined || anchor.start !== undefined)
      throw new Error("Invalid Markdown anchor");
    anchor.start = this.lines.length;
  }

  start(): number {
    const id = this.reserve();
    this.begin(id);
    return id;
  }

  end(id: number): void {
    const anchor = this.anchors.get(id);
    if (anchor?.start === undefined || anchor.end !== undefined) {
      throw new Error("Invalid Markdown anchor");
    }
    anchor.end = this.lines.length;
  }

  offset(id: number): string {
    return "~A" + String(id) + "O~";
  }

  length(id: number): string {
    return "~A" + String(id) + "L~";
  }

  finish(): string[] {
    for (const anchor of this.anchors.values()) {
      if (anchor.start === undefined || anchor.end === undefined) {
        throw new Error("Unclosed Markdown anchor");
      }
    }
    let end = this.lines.length;
    while (end > 0 && this.lines[end - 1] === "") end--;
    const rendered = this.lines.slice(0, end).map((line) =>
      line.replace(/~A(\d+)([OL])~/g, (_match, textId: string, field: string) => {
        const anchor = this.anchors.get(Number(textId));
        if (anchor?.start === undefined || anchor.end === undefined)
          throw new Error("Unclosed Markdown anchor");
        return String(field === "O" ? anchor.start : Math.min(anchor.end, end) - anchor.start);
      })
    );
    const bytes = Buffer.byteLength(rendered.join("\n") + "\n", "utf8");
    if (bytes > MAX_VIEW_BYTES) {
      throw new ExecutionError("RESOURCE_ERROR", "Markdown view exceeds resource budget");
    }
    return rendered;
  }
}
