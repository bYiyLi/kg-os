interface SourceToken {
  text: string;
  start: number;
  end: number;
}

function tokenEnd(source: string, start: number): number {
  let index = start + 1;
  const char = source[start] ?? "";
  if (char === '"') {
    while (index < source.length) {
      const next = source[index++];
      if (next === "\\") index += 1;
      else if (next === '"') break;
    }
  } else if (!"{}:,[]".includes(char)) {
    while (index < source.length && !/[\s{}:,[\]]/u.test(source[index] ?? "")) index += 1;
  }
  return index;
}

function tokens(source: string): SourceToken[] {
  JSON.parse(source);
  const items: SourceToken[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index] ?? "";
    if (/\s/u.test(char)) {
      index += 1;
      continue;
    }
    const start = index;
    index = tokenEnd(source, start);
    items.push({ text: source.slice(start, index), start, end: index });
  }
  return items;
}

function afterValue(items: SourceToken[], start: number): number {
  let depth = 0;
  for (let index = start; index < items.length; index += 1) {
    const text = items[index]?.text;
    if (text === "{" || text === "[") depth += 1;
    else if (text === "}" || text === "]") depth -= 1;
    if (depth === 0) return index + 1;
  }
  return items.length;
}

function sourceSlice(source: string, items: SourceToken[], begin: number, next: number) {
  const first = items[begin];
  const last = items[next - 1];
  return first === undefined || last === undefined
    ? undefined
    : source.slice(first.start, last.end);
}

export function jsonSourceField(source: string, key: string): string | undefined {
  const items = tokens(source);
  if (items[0]?.text !== "{") return undefined;
  let found: string | undefined;
  let index = 1;
  while (index < items.length && items[index]?.text !== "}") {
    const name = items[index]?.text;
    if (name === undefined) break;
    const next = afterValue(items, index + 2);
    if (JSON.parse(name) === key) found = sourceSlice(source, items, index + 2, next);
    index = next + 1;
  }
  return found;
}

export function jsonArraySources(source: string): string[] {
  const items = tokens(source);
  if (items[0]?.text !== "[") throw new TypeError("Expected JSON array source");
  const values: string[] = [];
  let index = 1;
  while (index < items.length && items[index]?.text !== "]") {
    const next = afterValue(items, index);
    const value = sourceSlice(source, items, index, next);
    if (value !== undefined) values.push(value);
    index = next + 1;
  }
  return values;
}

interface SourceFrame {
  values: string[];
  members: Map<string, string> | undefined;
  key: string;
}

function append(value: string, stack: SourceFrame[]): string | undefined {
  const frame = stack.at(-1);
  if (frame === undefined) return value;
  if (frame.members === undefined) frame.values.push(value);
  else frame.members.set(frame.key, value);
  return undefined;
}

function frameJSON(frame: SourceFrame): string {
  return frame.members === undefined
    ? `[${frame.values.join(",")}]`
    : `{${[...frame.members]
        .sort(([left], [right]) => (left < right ? -1 : 1))
        .map(([key, value]) => `${JSON.stringify(key)}:${value}`)
        .join(",")}}`;
}

function tokenValue(items: SourceToken[], index: number, stack: SourceFrame[]) {
  const text = items[index]?.text ?? "";
  if (text === ":" || text === ",") return undefined;
  if (text === "{" || text === "[") {
    stack.push({ values: [], members: text === "{" ? new Map() : undefined, key: "" });
    return undefined;
  }
  if (text.startsWith('"') && items[index + 1]?.text === ":") {
    const frame = stack.at(-1);
    if (frame !== undefined) frame.key = JSON.parse(text) as string;
    return undefined;
  }
  if (text === "}" || text === "]") {
    const frame = stack.pop();
    return frame === undefined ? undefined : frameJSON(frame);
  }
  return text.startsWith('"') ? JSON.stringify(JSON.parse(text)) : text;
}

export function stableSourceJSON(source: string): string {
  const items = tokens(source);
  const stack: SourceFrame[] = [];
  let result = "";
  for (let index = 0; index < items.length; index += 1) {
    const value = tokenValue(items, index, stack);
    if (value !== undefined) result = append(value, stack) ?? result;
  }
  return result;
}

export function validSourceJSON(source: unknown): string | undefined {
  if (typeof source !== "string") return undefined;
  try {
    JSON.parse(source);
    return source;
  } catch {
    return undefined;
  }
}
