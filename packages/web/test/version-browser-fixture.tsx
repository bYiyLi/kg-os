import { act } from "react";
import type { EvolutionGetResult, ResolvedState } from "@kgos/sdk";
import { I18nextProvider } from "react-i18next";
import { vi } from "vitest";

import { i18n } from "../src/app/i18n/index.js";
import { WorkspaceShell } from "../src/app/layout/workspace-shell.js";
import type { DomainReader } from "../src/features/domain/domain-data.js";
import { stateRef, type VersionReader } from "../src/features/version/version-data.js";
import { UiProvider } from "../src/shared/ui/ui-provider.js";

export const main = "a".repeat(64);
export const develop = "b".repeat(64);
const experiment = "c".repeat(64);
const feature = "d".repeat(64);
const first = "e".repeat(64);
export const common = "f".repeat(64);
export const genesis = "0".repeat(64);
export const at = Date.now() * 1000;
export const ONTOLOGY_COMMIT = "Update ontology";
export const WORLD_ACTIONS = "Knowledge world actions";
export const WORLD_REFRESH = "Refresh knowledge worlds";
export const CROSS_WORLD_FILTER = "Filter knowledge worlds";
export const SHARED_MESSAGE = "Shared commit";
export const PRESSED_ATTRIBUTE = "aria-pressed";

export function row(state: string, message: string, offset: number, parents: string[]) {
  return {
    state: stateRef(state),
    message,
    committedAt: at + offset,
    parents: parents.map(stateRef)
  };
}

export function mockReader(): VersionReader & DomainReader {
  return {
    ontology: {
      read: vi.fn().mockImplementation((request: { at: ResolvedState }) =>
        Promise.resolve({
          state: request.at,
          results: [
            {
              kind: "overview",
              total: 2,
              markdown: "",
              items: [
                { kind: "domain", ref: "domain:Knowledge", name: "Knowledge" },
                { kind: "domain", ref: "domain:Topics", name: "Topics" }
              ]
            }
          ]
        })
      )
    },
    object: {
      read: vi.fn().mockImplementation((request: { at: ResolvedState; refs: string[] }) =>
        Promise.resolve({
          state: request.at,
          results: request.refs.map((ref) => ({
            kind: "domain",
            ref,
            value: {
              name: ref.slice(7),
              includes: ref === "domain:Knowledge" ? ["domain:Topics"] : []
            }
          }))
        })
      )
    },
    branch: {
      list: vi.fn().mockResolvedValue({
        items: [
          { name: "main", state: main },
          { name: "develop", state: develop },
          { name: "experiment", state: experiment },
          { name: "feature/search", state: feature }
        ]
      })
    },
    tag: { list: vi.fn().mockResolvedValue({ items: [{ name: "v1", state: common }] }) },
    ancestry: vi.fn().mockImplementation((request: { root: string; cursor?: string }) => {
      if (request.root === "commit/" + main)
        return Promise.resolve(
          request.cursor === undefined
            ? {
                root: main,
                items: [
                  row(main, "Merge experiment", 4000, [first, experiment]),
                  row(first, "Fix properties", 500, [common])
                ],
                cursor: "next-main"
              }
            : { root: main, items: [row(genesis, "Initial knowledge", -4000, [])] }
        );
      if (request.root === "commit/" + develop)
        return Promise.resolve({
          root: develop,
          items: [row(develop, ONTOLOGY_COMMIT, 3000, [common]), row(common, SHARED_MESSAGE, 0, [])]
        });
      if (request.root === "commit/" + experiment)
        return Promise.resolve({
          root: experiment,
          items: [row(experiment, "Experiment", 2000, [common]), row(common, SHARED_MESSAGE, 0, [])]
        });
      return Promise.resolve({
        root: feature,
        items: [row(feature, "Hybrid search", 1000, [common]), row(common, SHARED_MESSAGE, 0, [])]
      });
    }),
    get: vi
      .fn()
      .mockImplementation((request: { state: string }) => Promise.resolve(resolved(request.state)))
  };
}

export function VersionBrowserHarness({
  reader,
  defaultBranch = "main",
  initialState = main
}: {
  reader: VersionReader | null;
  defaultBranch?: string | null;
  initialState?: string;
}) {
  const domainReader =
    reader !== null && "ontology" in reader && "object" in reader
      ? (reader as VersionReader & DomainReader)
      : null;
  return (
    <I18nextProvider i18n={i18n}>
      <UiProvider>
        <WorkspaceShell
          versionReader={reader}
          domainReader={domainReader}
          initialVersionState={initialState}
          defaultVersionBranch={defaultBranch}
        />
      </UiProvider>
    </I18nextProvider>
  );
}

export function findButton(text: string) {
  const button = [...document.body.querySelectorAll<HTMLElement>("button,[role=menuitem]")].find(
    (element) => element.getAttribute("aria-label") === text || element.textContent.trim() === text
  );
  if (button === undefined) throw new Error("Missing button " + text);
  return button;
}

export function click(text: string) {
  const button = findButton(text);
  act(() => {
    button.click();
  });
  return button;
}

export function checkbox(name: string) {
  const input = [...document.body.querySelectorAll<HTMLElement>('[role="checkbox"]')].find(
    (item) => item.getAttribute("aria-label") === name
  );
  if (input === undefined) throw new Error("Missing checkbox: " + name);
  return input;
}

export function rows() {
  return [
    ...document.body.querySelectorAll<HTMLButtonElement>("button.commit-row,button.version-dag-row")
  ];
}

export function namedRow(message: string) {
  const button = rows().find((item) => item.textContent.includes(message));
  if (button === undefined) throw new Error("Missing version row " + message);
  return button;
}

export function worldButton(name: string) {
  const item = [
    ...document.body.querySelectorAll<HTMLButtonElement>(".world-section-trigger")
  ].find((element) => element.getAttribute("aria-label") === name);
  if (item === undefined) throw new Error("Missing knowledge world " + name);
  return item;
}

export function worldToggle(name: string) {
  return findButton("Expand knowledge world: " + name);
}

export function inputValue(label: string, value: string) {
  const input = [...document.body.querySelectorAll<HTMLInputElement>('input[type="search"]')].find(
    (item) => item.getAttribute("aria-label") === label
  );
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  if (input === undefined || descriptor?.set === undefined)
    throw new Error("Missing input " + label);
  act(() => {
    descriptor.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

export function resolved(state: string): EvolutionGetResult {
  return {
    state: stateRef(state),
    parents: [],
    committedAt: at,
    consistency: { status: "valid", issues: [] },
    hasData: false,
    data: null
  };
}

export async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

export async function chooseWorld(name: string) {
  act(() => {
    worldButton(name).click();
  });
  await flush();
}

export async function openRelationships(name = "main") {
  click("View history: " + name);
  await flush();
}

export async function showAcrossWorlds() {
  click(WORLD_ACTIONS);
  click("View history across worlds");
  await flush();
}
