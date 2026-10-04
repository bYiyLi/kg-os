import { useEffect, useMemo, useSyncExternalStore } from "react";
import { type EvolutionGetResult } from "@kgos/sdk";

import { type Connection } from "./connection.js";
import { type Context } from "./context.js";
import { type Records } from "./records.js";
import { ValueView } from "./value-view.js";
import { StateDataDraft, StateDetail } from "./version-state.js";
import { StateLabels } from "./version-timeline.js";

function StateDataEditor({
  connection,
  value,
  records,
  source
}: {
  connection: Connection;
  value: EvolutionGetResult;
  records: Records | undefined;
  source: string | undefined;
}) {
  const model = useMemo(
    () =>
      new StateDataDraft(
        connection,
        value.state,
        { ...value, ...(source === undefined ? {} : { dataSource: source }) },
        records
      ),
    [connection, value, records, source]
  );
  useSyncExternalStore(model.subscribe, model.snapshot);
  useSyncExternalStore(
    records?.subscribe ?? (() => () => undefined),
    records?.snapshot ?? (() => 0)
  );
  useEffect(() => {
    void model.adoptRecord();
  }, [model, model.slot?.adoption, records?.snapshot(), model.sending]);
  return (
    <section className="state-data-editor">
      <h3>State Data · 当前 mutable 注释</h3>
      <p>
        {model.live.hasData ? "已设置 JSON 注释" : "ABSENT · 未设置"}
        {model.live.hasData && model.live.data === null ? " · 显式 JSON null" : ""}
      </p>
      <StateDataValue value={model.live} source={model.liveSource} />
      <p>注释不进入 Snapshot Diff / Merge，也不创建知识 State。现有接口没有 sidecar CAS。</p>
      <label>
        注释 JSON
        <textarea
          value={model.text}
          disabled={model.busy || model.sending || model.unknown || model.bindingInvalid}
          onChange={(event) => {
            model.edit(event.target.value);
          }}
          spellCheck={false}
          rows={6}
        />
      </label>
      <div className="actions">
        <button
          disabled={model.busy || model.sending || model.unknown || model.bindingInvalid}
          onClick={() => {
            model.edit("null");
          }}
        >
          设为 JSON null 草稿
        </button>
        <button
          disabled={model.busy || model.sending || model.unknown || model.bindingInvalid}
          onClick={() => {
            model.edit(model.text, "clear");
          }}
        >
          清除注释草稿
        </button>
      </div>
      <p>
        前端草稿 · 意图 {model.intent} · {model.slot?.status ?? "尚未编辑"}
      </p>
      {model.slot?.error !== undefined && model.slot.error !== "" && (
        <p role="alert">{model.slot.error}</p>
      )}
      <StateDataActions model={model} connection={connection} />
      {model.unknown && <p role="status">结果待核对，先重读；不会自动重发。</p>}
      {model.error !== "" && <p role="alert">{model.error}</p>}
      {model.notice !== "" && <p role="status">{model.notice}</p>}
      {!connection.writableStore && <p>提交需要可靠草稿保存，请恢复 Web 数据存储连接。</p>}
    </section>
  );
}

export function StateWorkspace({
  connection,
  context,
  state,
  records
}: {
  connection: Connection;
  context: Context;
  state: string;
  records: Records | undefined;
}) {
  const detail = useMemo(() => new StateDetail(connection), [connection]);
  useSyncExternalStore(detail.subscribe, detail.snapshot);
  useSyncExternalStore(connection.subscribe, connection.snapshot);
  useEffect(() => {
    void detail.open(state);
    return () => {
      detail.cancel();
    };
  }, [detail, state, connection.client]);
  const value = detail.value;
  return (
    <div className="state-workspace">
      {detail.busy && <p role="status">正在读取 State</p>}
      {detail.error !== "" && (
        <>
          <p role="alert">{detail.error}</p>
          <button
            onClick={() => {
              void detail.open(state);
            }}
          >
            重读 State
          </button>
        </>
      )}
      {value !== undefined && (
        <>
          <section className="state-metadata">
            <h3>Immutable State metadata</h3>
            <code>{value.state}</code>
            <h4>{value.message ?? "无提交说明"}</h4>
            <StateLabels context={context} state={value.state} />
            <p>
              {value.author ?? "未提供作者"} · {new Date(value.committedAt / 1000).toLocaleString()}
            </p>
            <button
              onClick={() => {
                void context.select(value.state);
              }}
            >
              按此 State 浏览
            </button>
            <h4>实际 parents</h4>
            {value.parents.length === 0 ? (
              <p>没有 parent</p>
            ) : (
              value.parents.map((parent) => (
                <button
                  key={parent}
                  onClick={() => {
                    void detail.open(parent);
                  }}
                >
                  {parent}
                </button>
              ))
            )}
            <p>Consistency: {value.consistency.status}</p>
            {value.consistency.issues.map((issue, index) => (
              <p key={`${issue.code}/${String(index)}`} role="alert">
                {issue.code} · {issue.message}
              </p>
            ))}
          </section>
          <StateDataEditor
            key={value.state}
            connection={connection}
            value={value}
            records={records}
            source={detail.dataSource}
          />
        </>
      )}
    </div>
  );
}

function StateDataActions({
  model,
  connection
}: {
  model: StateDataDraft;
  connection: Connection;
}) {
  return (
    <>
      {model.needsComparison && (
        <div className="state-data-comparison">
          <h4>恢复 / 核对原观察值</h4>
          <StateDataValue value={model.observed} source={model.observedSource} />
          <p>{comparisonMessage(model)}</p>
          <button
            disabled={model.busy || model.sending || !model.checked || model.bindingInvalid}
            onClick={() => {
              model.acknowledge();
            }}
          >
            已比较，继续编辑当前注释
          </button>
        </div>
      )}
      <div className="actions">
        <button
          disabled={model.busy || model.sending}
          onClick={() => {
            void model.check();
          }}
        >
          重读当前注释
        </button>
        <button
          disabled={
            model.busy ||
            model.sending ||
            model.unknown ||
            model.needsComparison ||
            model.records === undefined ||
            !connection.writableStore
          }
          onClick={() => {
            void model.submit();
          }}
        >
          确认{model.intent === "clear" ? "清除" : "设置"}注释
        </button>
      </div>
    </>
  );
}

function StateDataValue({
  value,
  source
}: {
  value: StateDataDraft["live"];
  source: string | undefined;
}) {
  if (!value.hasData) return <p>ABSENT · 未设置 JSON value</p>;
  if (source !== undefined)
    return (
      <pre className="value-view" tabIndex={0}>
        {source}
      </pre>
    );
  return (
    <div>
      <p>缺少原始 JSON，旧解析值的数字精度信息不足；请重读。</p>
      <ValueView value={value.data} />
    </div>
  );
}

function comparisonMessage(model: StateDataDraft) {
  if (!model.precisionKnown)
    return "旧记录缺少原始 JSON，精度信息不足；重读当前注释后比较原输入，不能声明值相同。";
  return model.changedSidecar ? "当前注释与原观察值不同" : "当前注释与原观察值相同";
}
