import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { type EvolutionChange } from "@kgos/sdk";

import { type Connection } from "./connection.js";
import { Modal } from "./dialog.js";
import { shorten } from "./json.js";
import { ValueView } from "./value-view.js";
import { ChangeDetails, type ChangeSide, VersionChanges } from "./version-changes.js";
import { ChangeGraph } from "./version-change-graph.js";
import { sourceField } from "./version-value-source.js";

function SideValue({ title, side }: { title: string; side: ChangeSide }) {
  useSyncExternalStore(side.subscribe, side.snapshot);
  return (
    <section className="change-side">
      <h3>{title}</h3>
      <code>{side.state}</code>
      <p>{side.ref}</p>
      {side.absent && <p>这一侧不存在</p>}
      {side.busy && <p role="status">正在读取完整对象</p>}
      {side.error !== "" && <p role="alert">{side.error}</p>}
      {side.value !== undefined && (
        <ValueView value={side.value} source={side.source} label="完整对象" />
      )}
    </section>
  );
}

export function ChangeComparison({
  change,
  before,
  after,
  connection,
  onClose,
  source
}: {
  change: EvolutionChange;
  before: string;
  after: string;
  connection: Connection;
  onClose: () => void;
  source?: string | undefined;
}) {
  const details = useMemo(() => new ChangeDetails(connection), [connection, change, before, after]);
  useEffect(
    () => () => {
      details.before.cancel();
      details.after.cancel();
    },
    [details]
  );
  return (
    <Modal title="公开对象变化" onClose={onClose} className="change-dialog">
      <ChangeGraph change={change} />
      <p>
        <strong>
          {change.change} · {change.kind}
        </strong>{" "}
        <code>{change.path === "" ? "整个对象" : change.path}</code>
      </p>
      <p>
        {change.beforeRef ?? "这一侧不存在"} → {change.afterRef ?? "这一侧不存在"}
      </p>
      {change.change === "rename" && <p>后端已报告 rename continuity。</p>}
      {change.relatedRefs !== undefined && <p>涉及聚合：{change.relatedRefs.join(" · ")}</p>}
      <div className="change-columns">
        <section>
          <h3>Before 变化片段</h3>
          {Object.hasOwn(change, "before") ? (
            <ValueView value={change.before ?? null} source={sourceField(source, "before")} />
          ) : (
            <p>ABSENT · 未提供值</p>
          )}
        </section>
        <section>
          <h3>After 变化片段</h3>
          {Object.hasOwn(change, "after") ? (
            <ValueView value={change.after ?? null} source={sourceField(source, "after")} />
          ) : (
            <p>ABSENT · 未提供值</p>
          )}
        </section>
      </div>
      <p>片段只说明公开 path 的变化；完整详情分别从各侧 State + Ref 读取。</p>
      <button
        onClick={() => {
          void details.open(change, before, after);
        }}
      >
        读取两侧完整对象
      </button>
      <div className="change-columns">
        <SideValue title="Before 完整对象" side={details.before} />
        <SideValue title="After 完整对象" side={details.after} />
      </div>
    </Modal>
  );
}

function ScopeFields({
  scope,
  setScope,
  refText,
  setRef,
  anchor,
  setAnchor,
  states
}: {
  scope: string;
  setScope: (value: string) => void;
  refText: string;
  setRef: (value: string) => void;
  anchor: string;
  setAnchor: (value: string) => void;
  states: string[];
}) {
  return (
    <>
      <label>
        范围
        <select
          value={scope}
          onChange={(event) => {
            setScope(event.target.value);
          }}
        >
          <option value="all">全部</option>
          <option value="knowledge">Knowledge</option>
          <option value="ontology">Ontology</option>
          <option value="object">单个 Object</option>
        </select>
      </label>
      {scope === "object" && (
        <>
          <label>
            Object Ref
            <input
              value={refText}
              onChange={(event) => {
                setRef(event.target.value);
              }}
              placeholder="例如 n:1 或 node:Model"
            />
          </label>
          <label>
            Object anchor State
            <select
              value={anchor}
              onChange={(event) => {
                setAnchor(event.target.value);
              }}
            >
              {states.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </label>
          <p>
            anchor 必须在 History root ancestry 内，或等于 Diff 的 Before / After；由 Kernel 验证
            continuity。
          </p>
        </>
      )}
    </>
  );
}

function ChangeRows({
  model,
  filter,
  onSelect
}: {
  model: VersionChanges;
  filter: string;
  onSelect: (change: EvolutionChange, before: string, after: string) => void;
}) {
  const [page, setPage] = useState(0);
  const entries =
    model.query?.mode === "history"
      ? model.history.map((entry) => ({
          change: entry.change,
          before: entry.parents[0] ?? "",
          after: entry.state,
          parents: entry.parents
        }))
      : model.changes.map((change) => ({
          change,
          before: model.before,
          after: model.after,
          parents: []
        }));
  const filtered = entries.filter(
    (entry) =>
      filter === "" ||
      `${JSON.stringify(entry)} ${entry.change === null ? "" : (model.changeSources.get(entry.change) ?? "")}`
        .toLocaleLowerCase()
        .includes(filter.toLocaleLowerCase())
  );
  const start = Math.min(page * 20, Math.max(0, filtered.length - 1));
  return (
    <section className="change-list" aria-label="已加载公开 Change">
      <p>
        已加载 {entries.length} 条变化记录 · 显示已加载过滤范围 {filtered.length} 条
      </p>
      {filtered.slice(start, start + 20).map((entry, index) => (
        <ChangeRow key={start + index} entry={entry} onSelect={onSelect} />
      ))}
      {entries.length === 0 && !model.busy && model.error === "" && (
        <p>
          {model.query?.mode === "diff"
            ? "这两侧在所选范围没有 Snapshot 差异"
            : "所选范围尚无业务变化"}
        </p>
      )}
      <div className="actions">
        <button
          disabled={page === 0}
          onClick={() => {
            setPage(page - 1);
          }}
        >
          上一片段
        </button>
        <button
          disabled={start + 20 >= filtered.length}
          onClick={() => {
            setPage(page + 1);
          }}
        >
          下一片段
        </button>
      </div>
    </section>
  );
}

export function ChangesWorkspace({
  connection,
  state,
  states,
  mode
}: {
  connection: Connection;
  state: string;
  states: string[];
  mode: "diff" | "history";
}) {
  const model = useMemo(() => new VersionChanges(connection), [connection]);
  useSyncExternalStore(model.subscribe, model.snapshot);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<{
    change: EvolutionChange;
    before: string;
    after: string;
  }>();
  return (
    <div className="changes-workspace">
      <ChangesParameters model={model} state={state} states={states} mode={mode} />
      <p>
        新参数开新分页；已加载结果固定其 root / Before / After 与 scope。State Data 和 ref 不进入
        Snapshot 变化。
      </p>
      {model.after !== "" && (
        <p>
          <code>{model.before}</code>
          {mode === "diff" ? " → " : "root: "}
          <code>{model.after}</code>
        </p>
      )}
      {model.error !== "" && <p role="alert">{model.error}</p>}
      <label>
        在已加载 Change 内筛选
        <input
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
          }}
        />
      </label>
      <ChangeRows
        key={`${model.query?.mode ?? ""}/${model.after}/${model.before}/${model.query?.request.scope ?? ""}`}
        model={model}
        filter={filter}
        onSelect={(change, left, right) => {
          setSelected({ change, before: left, after: right });
        }}
      />
      <button
        disabled={model.busy || model.cursor === undefined}
        onClick={() => {
          void model.more();
        }}
      >
        {model.busy ? "正在读取" : "加载更多 Change"}
      </button>
      {selected !== undefined && (
        <ChangeComparison
          {...selected}
          source={model.changeSources.get(selected.change)}
          connection={connection}
          onClose={() => {
            setSelected(undefined);
          }}
        />
      )}
    </div>
  );
}

interface ChangeEntry {
  change: EvolutionChange | null;
  before: string;
  after: string;
  parents: string[];
}
function ChangeRow({
  entry,
  onSelect
}: {
  entry: ChangeEntry;
  onSelect: (change: EvolutionChange, before: string, after: string) => void;
}) {
  return (
    <article className="change-row">
      <code>{shorten(entry.after)}</code>
      {entry.change === null ? (
        <p>空 Snapshot delta · 真实 State 保留在业务历史中</p>
      ) : (
        <>
          <button
            onClick={() => {
              if (entry.change !== null) onSelect(entry.change, entry.before, entry.after);
            }}
          >
            {entry.change.change} · {entry.change.kind} ·{" "}
            {entry.change.afterRef ?? entry.change.beforeRef ?? "公开变化"}
          </button>
          <code>{entry.change.path === "" ? "整个对象" : entry.change.path}</code>
          {entry.parents.length > 1 && (
            <label>
              读取 Before parent
              <select
                defaultValue={entry.before}
                onChange={(event) => {
                  if (entry.change !== null)
                    onSelect(entry.change, event.target.value, entry.after);
                }}
              >
                {entry.parents.map((parent) => (
                  <option key={parent} value={parent}>
                    {parent}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      )}
    </article>
  );
}

function ChangesParameters({
  model,
  state,
  states,
  mode
}: {
  model: VersionChanges;
  state: string;
  states: string[];
  mode: "diff" | "history";
}) {
  const [before, setBefore] = useState(states.find((candidate) => candidate !== state) ?? state);
  const [after, setAfter] = useState(state);
  const [scope, setScope] = useState("all");
  const [refText, setRef] = useState("");
  const [anchor, setAnchor] = useState(state);
  const actualAnchor = mode === "diff" && anchor !== before && anchor !== after ? after : anchor;
  const run = () => {
    const object =
      scope === "object" ? { object: { anchorState: actualAnchor, ref: refText } } : {};
    void model.openPinned(
      mode === "history"
        ? { mode, request: { root: after, scope, limit: 20, ...object } }
        : { mode, request: { before, after, scope, limit: 20, ...object } }
    );
  };
  return (
    <>
      <div className="form-grid">
        {mode === "diff" && (
          <label>
            Before StateRef
            <input
              value={before}
              onChange={(event) => {
                setBefore(event.target.value);
              }}
            />
          </label>
        )}
        <label>
          {mode === "history" ? "History root" : "After StateRef"}
          <input
            value={after}
            onChange={(event) => {
              setAfter(event.target.value);
            }}
          />
        </label>
        <ScopeFields
          scope={scope}
          setScope={setScope}
          refText={refText}
          setRef={setRef}
          anchor={actualAnchor}
          setAnchor={setAnchor}
          states={[...new Set(mode === "diff" ? [before, after] : [after, ...states])]}
        />
      </div>
      <button disabled={model.busy} onClick={run}>
        {mode === "diff" ? "比较两 State" : "读取业务历史"}
      </button>
    </>
  );
}
