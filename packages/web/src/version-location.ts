import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { type Context } from "./context.js";
import { type Records } from "./records.js";

export const versionTitles = {
  dag: "版本 ancestry DAG",
  state: "State 详情",
  diff: "两 State 差异",
  history: "业务历史",
  refs: "Branch / Tag / State",
  merge: "Merge Session"
};

export type VersionView = keyof typeof versionTitles;

function isView(value: unknown): value is VersionView {
  return typeof value === "string" && Object.hasOwn(versionTitles, value);
}

export function useVersionLocation(records: Records | undefined, context: Context) {
  const [location, setLocation] = useState<{ view: VersionView | undefined; state: string }>({
    view: undefined,
    state: ""
  });
  const restored = useRef<Records | undefined>(undefined);
  const revision = useSyncExternalStore(
    records?.subscribe ?? (() => () => undefined),
    records?.snapshot ?? (() => 0)
  );
  useEffect(() => {
    if (records === undefined || restored.current === records || !context.runnable) return;
    const data = records.slots.find((slot) => slot.kind === "workspace")?.data;
    if (data === undefined) return;
    restored.current = records;
    const view = data["versionView"];
    const state = data["versionDetailState"];
    if (isView(view)) setLocation({ view, state: typeof state === "string" ? state : "" });
  }, [records, context.runnable, revision]);
  const open = (view: VersionView | undefined, state = location.state) => {
    restored.current = records;
    const workspace = records?.slots.find((slot) => slot.kind === "workspace");
    workspace?.edit({
      ...workspace.data,
      versionView: view ?? "",
      versionDetailState: state
    });
    setLocation({ view, state });
  };
  return { ...location, open };
}
