// @vitest-environment happy-dom
import { type JsonValue } from "@kgos/sdk";
import { act as reactAct } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";

import { RowsView, ValueView } from "./value-view.js";

async function act(operation: () => void) {
  await reactAct(async () => {
    operation();
    await Promise.resolve();
  });
}

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Missing test element");
  return value;
}

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => {
  await act(() => {
    root?.unmount();
  });
  document.body.replaceChildren();
});

async function mount(value: React.ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(() => {
    root?.render(value);
  });
}

async function click(text: string) {
  const button = required(
    [...container.querySelectorAll("button")].find((item) => item.textContent === text)
  );
  await act(() => {
    button.click();
  });
}

it("previews long typed values and expands the original precision-preserving encoding", async () => {
  const value = {
    $type: "Integer",
    value: "9007199254740993",
    note: "文".repeat(400),
    null: null
  };
  const text = JSON.stringify(value, null, 2);
  await mount(<ValueView value={value} label="属性" />);
  expect(container.querySelector("pre")?.textContent).toBe(text.slice(0, 320));
  await click("展开属性");
  expect(container.querySelector("pre")?.textContent).toBe(text);
  await click("收起");
  expect(container.querySelector("pre")?.textContent).toBe(text.slice(0, 320));
  await act(() => {
    root?.render(<ValueView value={null} />);
  });
  expect(container.querySelector("pre")?.textContent).toBe("null");
  expect(container.querySelector("button")).toBeNull();
});

it("renders twenty-row fragments and can traverse and return without changing rows", async () => {
  const rows = Array.from({ length: 43 }, (_, index) => [index]);
  await mount(<RowsView rows={rows} />);
  expect(container.querySelectorAll("pre")).toHaveLength(20);
  expect(container.textContent).toContain("显示 1–20");
  expect(container.querySelector<HTMLButtonElement>("button")?.disabled).toBe(true);
  await click("下一片段");
  expect(container.textContent).toContain("显示 21–40");
  await click("下一片段");
  expect(container.querySelectorAll("pre")).toHaveLength(3);
  expect(container.textContent).toContain("显示 41–43");
  expect(container.querySelector<HTMLButtonElement>("button:last-child")?.disabled).toBe(true);
  await click("上一片段");
  expect(container.textContent).toContain("显示 21–40");
  expect(rows).toHaveLength(43);
  await act(() => {
    root?.render(<RowsView rows={[]} />);
  });
  expect(container.textContent).toContain("显示 0–0");
  expect(container.querySelectorAll("pre")).toHaveLength(0);
});

it("previews and expands original JSON source without merging float, integer or negative-zero encodings", async () => {
  const source = `[ 1.0, 1, -0.0, {"nested":[9007199254740993,1e400],"big":{"$type":"Integer","value":"9007199254740993"},"text":"${"界".repeat(400)}"} ]`;
  const value = JSON.parse(source) as JsonValue;
  await mount(<ValueView value={value} source={source} label="属性" />);
  expect(container.querySelector("pre")?.textContent).toBe(source.slice(0, 320));
  expect(container.querySelector("pre")?.textContent).toContain("1.0, 1, -0.0");
  expect(container.querySelector("pre")?.textContent).toContain("9007199254740993,1e400");
  await click("展开属性");
  expect(container.querySelector("pre")?.textContent).toBe(source);
  await click("收起");
  expect(container.querySelector("pre")?.textContent).toBe(source.slice(0, 320));
});

it("keeps original row-source alignment when paging JSON fragments", async () => {
  const sources = Array.from(
    { length: 22 },
    (_, index) =>
      `[${String(index)}.0,${String(index)},-0.0,{"$type":"Integer","value":"9007199254740993"}]`
  );
  const rows = sources.map((source) => JSON.parse(source) as JsonValue[]);
  await mount(<RowsView rows={rows} sources={sources} />);
  expect([...container.querySelectorAll("pre")].map((element) => element.textContent)).toEqual(
    sources.slice(0, 20)
  );
  await click("下一片段");
  expect(container.textContent).toContain("显示 21–22");
  expect([...container.querySelectorAll("pre")].map((element) => element.textContent)).toEqual(
    sources.slice(20)
  );
  await click("上一片段");
  expect(container.querySelector("pre")?.textContent).toBe(sources[0]);
});
